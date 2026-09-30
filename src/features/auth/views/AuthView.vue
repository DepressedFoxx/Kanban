<script setup lang="ts">
import { appConfig } from '@/config/app'
import { authLinkError } from '@/lib/supabase'
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import { authConfig } from '../config'
import { safeRedirect } from '../navigation'
import AuthFeedback from '../components/AuthFeedback.vue'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const form = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  displayName: '',
})
const mode = computed(
  () => route.meta.authMode as 'login' | 'register' | 'forgot' | 'reset',
)
const titles = {
  login: 'Chào mừng trở lại',
  register: 'Tạo tài khoản',
  forgot: 'Quên mật khẩu?',
  reset: 'Đặt mật khẩu mới',
}
const labels = {
  login: 'Đăng nhập',
  register: 'Đăng ký',
  forgot: 'Gửi liên kết khôi phục',
  reset: 'Lưu mật khẩu mới',
}
watch(
  mode,
  () => {
    auth.clearFeedback()
    form.password = ''
    form.confirmPassword = ''
  },
  { immediate: true },
)
async function submit() {
  const submittedPath = route.path
  if (mode.value === 'reset' && authLinkError) return
  let ok = false
  if (mode.value === 'login') ok = await auth.login(form)
  else if (mode.value === 'register') ok = await auth.register(form)
  else if (mode.value === 'forgot') ok = await auth.requestReset(form.email)
  else ok = await auth.resetPassword(form)
  if (!ok || route.path !== submittedPath) return
  form.password = ''
  form.confirmPassword = ''
  if (
    (mode.value === 'login' || mode.value === 'register') &&
    auth.authenticated
  )
    await router.replace(safeRedirect(route.query.redirect))
}
</script>
<template>
  <main
    class="flex min-h-dvh items-center justify-center bg-background px-4 py-10"
  >
    <section
      class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <RouterLink
        :to="appConfig.routes.board"
        class="text-lg font-semibold text-primary"
        >kanban.</RouterLink
      >
      <h1 class="mt-6 text-2xl font-semibold">{{ titles[mode] }}</h1>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">
        Một tài khoản để bắt đầu không gian làm việc của bạn.
      </p>
      <div class="mt-6 grid gap-4">
        <AuthFeedback />
        <p
          v-if="mode === 'reset' && (!auth.authenticated || authLinkError)"
          role="alert"
          class="text-sm text-destructive"
        >
          Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu một email khôi phục
          mới.
        </p>
        <form
          class="grid gap-4"
          :aria-busy="auth.pending"
          @submit.prevent="submit"
        >
          <div v-if="mode === 'register'" class="field">
            <Label for="auth-name">Tên hiển thị</Label
            ><Input
              id="auth-name"
              v-model="form.displayName"
              autocomplete="nickname"
              :maxlength="authConfig.maxDisplayNameLength"
              required
              :disabled="auth.pending"
            />
          </div>
          <div v-if="mode !== 'reset'" class="field">
            <Label for="auth-email">Email</Label
            ><Input
              id="auth-email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              maxlength="254"
              required
              :disabled="auth.pending"
            />
          </div>
          <div v-if="mode !== 'forgot'" class="field">
            <Label for="auth-password">{{
              mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'
            }}</Label
            ><Input
              id="auth-password"
              v-model="form.password"
              type="password"
              :autocomplete="
                mode === 'login' ? 'current-password' : 'new-password'
              "
              :minlength="mode === 'login' ? 1 : authConfig.minPasswordLength"
              :maxlength="authConfig.maxPasswordLength"
              required
              :disabled="auth.pending"
            />
            <p v-if="mode !== 'login'" class="text-xs text-muted-foreground">
              Ít nhất {{ authConfig.minPasswordLength }} ký tự.
            </p>
          </div>
          <div v-if="mode === 'register' || mode === 'reset'" class="field">
            <Label for="auth-confirm">Xác nhận mật khẩu</Label
            ><Input
              id="auth-confirm"
              v-model="form.confirmPassword"
              type="password"
              autocomplete="new-password"
              required
              :disabled="auth.pending"
            />
          </div>
          <Button
            type="submit"
            class="w-full"
            :disabled="
              auth.pending ||
              !auth.configured ||
              (mode === 'reset' && (!auth.authenticated || authLinkError))
            "
            >{{ auth.pending ? 'Đang xử lý…' : labels[mode] }}</Button
          >
          <Button
            v-if="mode === 'login' || mode === 'register'"
            type="button"
            variant="outline"
            :disabled="auth.pending || !auth.configured || !form.email.trim()"
            @click="auth.resendVerification(form.email)"
            >Gửi lại email xác minh</Button
          >
        </form>
        <nav
          class="flex flex-wrap gap-x-4 gap-y-3 text-sm text-primary"
          aria-label="Tài khoản"
        >
          <RouterLink
            v-if="mode !== 'login'"
            :to="{
              path: authConfig.routes.login,
              query: route.query.redirect
                ? { redirect: safeRedirect(route.query.redirect) }
                : {},
            }"
            >Đăng nhập</RouterLink
          >
          <RouterLink
            v-if="mode === 'login'"
            :to="{
              path: authConfig.routes.register,
              query: route.query.redirect
                ? { redirect: safeRedirect(route.query.redirect) }
                : {},
            }"
            >Tạo tài khoản</RouterLink
          >
          <RouterLink
            v-if="mode === 'login' || mode === 'reset'"
            :to="authConfig.routes.forgot"
            >{{
              mode === 'reset' ? 'Gửi liên kết mới' : 'Quên mật khẩu?'
            }}</RouterLink
          >
          <RouterLink v-if="auth.authenticated" :to="authConfig.routes.account"
            >Về tài khoản</RouterLink
          >
        </nav>
      </div>
    </section>
  </main>
</template>
