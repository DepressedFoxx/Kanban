import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase, authConfigurationError } from '@/lib/supabase'
import { authConfig } from '@/features/auth/config'
import {
  authError,
  displayNameSchema,
  emailSchema,
  loginSchema,
  registerSchema,
  resetSchema,
} from '@/features/auth/validation'

export const useAuthStore = defineStore('auth', () => {
  const session = shallowRef<Session | null>(null)
  const ready = ref(false)
  const pending = ref(false)
  const error = ref('')
  const notice = ref('')
  const initializationError = ref('')
  const recovering = ref(false)
  const user = computed(() => session.value?.user ?? null)
  const authenticated = computed(() => Boolean(user.value?.email_confirmed_at))
  const configured = Boolean(supabase)
  let initialization: Promise<void> | undefined
  let unsubscribe: (() => void) | undefined
  let eventVersion = 0

  function initialize() {
    if (initialization) return initialization
    initialization = (async () => {
      if (!supabase) {
        ready.value = true
        return
      }
      const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
        // Never await another Supabase auth call inside this callback.
        eventVersion++
        session.value = nextSession
        if (event === 'PASSWORD_RECOVERY') recovering.value = true
        if (event === 'SIGNED_OUT') recovering.value = false
      })
      unsubscribe = () => data.subscription.unsubscribe()
      const version = eventVersion
      try {
        const result = await supabase.auth.getSession()
        if (result.error) throw result.error
        if (version === eventVersion) session.value = result.data.session
      } catch (cause) {
        initializationError.value = authError(cause)
      } finally {
        ready.value = true
      }
    })()
    return initialization
  }
  onScopeDispose(() => unsubscribe?.())
  function clearFeedback() {
    error.value = ''
    notice.value = ''
  }
  async function run(action: () => Promise<void>) {
    if (pending.value) return false
    clearFeedback()
    if (!supabase) {
      error.value = authConfigurationError
      return false
    }
    pending.value = true
    try {
      await action()
      return true
    } catch (cause) {
      error.value = authError(cause)
      return false
    } finally {
      pending.value = false
    }
  }
  const redirectUrl = (route: string) =>
    new URL(route, window.location.origin).href
  function login(input: { email: string; password: string }) {
    return run(async () => {
      const result = await supabase!.auth.signInWithPassword(
        loginSchema.parse(input),
      )
      if (result.error) throw result.error
      session.value = result.data.session
      initializationError.value = ''
      if (!authenticated.value) throw { code: 'email_not_confirmed' }
    })
  }
  function register(input: {
    email: string
    password: string
    displayName: string
    confirmPassword: string
  }) {
    return run(async () => {
      const values = registerSchema.parse(input)
      const result = await supabase!.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { display_name: values.displayName },
          emailRedirectTo: redirectUrl(authConfig.routes.callback),
        },
      })
      if (result.error) throw result.error
      session.value = result.data.session
      notice.value =
        'Nếu yêu cầu đăng ký hợp lệ, bạn sẽ nhận email xác minh. Hãy kiểm tra hộp thư và thư rác.'
    })
  }
  function resendVerification(email: string) {
    return run(async () => {
      const result = await supabase!.auth.resend({
        type: 'signup',
        email: emailSchema.parse(email),
        options: { emailRedirectTo: redirectUrl(authConfig.routes.callback) },
      })
      if (result.error) throw result.error
      notice.value =
        'Nếu tài khoản cần xác minh, email hướng dẫn sẽ được gửi. Hãy kiểm tra hộp thư.'
    })
  }
  function requestReset(email: string) {
    return run(async () => {
      const result = await supabase!.auth.resetPasswordForEmail(
        emailSchema.parse(email),
        { redirectTo: redirectUrl(authConfig.routes.reset) },
      )
      if (result.error) throw result.error
      notice.value =
        'Nếu email đã được đăng ký, bạn sẽ nhận liên kết đặt lại mật khẩu.'
    })
  }
  function resetPassword(input: { password: string; confirmPassword: string }) {
    return run(async () => {
      if (!authenticated.value) throw { code: 'otp_expired' }
      const { password } = resetSchema.parse(input)
      const result = await supabase!.auth.updateUser({ password })
      if (result.error) throw result.error
      recovering.value = false
      notice.value = 'Đã cập nhật mật khẩu.'
    })
  }
  function updateProfile(displayName: string) {
    return run(async () => {
      const result = await supabase!.auth.updateUser({
        data: { display_name: displayNameSchema.parse(displayName) },
      })
      if (result.error) throw result.error
      if (session.value)
        session.value = { ...session.value, user: result.data.user }
      notice.value = 'Đã lưu hồ sơ.'
    })
  }
  function logout() {
    return run(async () => {
      const result = await supabase!.auth.signOut({ scope: 'local' })
      if (result.error) throw result.error
      session.value = null
      recovering.value = false
    })
  }
  return {
    session,
    user,
    ready,
    pending,
    error,
    notice,
    initializationError,
    recovering,
    authenticated,
    configured,
    initialize,
    clearFeedback,
    login,
    register,
    resendVerification,
    requestReset,
    resetPassword,
    updateProfile,
    logout,
  }
})
