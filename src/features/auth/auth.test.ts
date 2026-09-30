import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useAuthStore } from '@/stores/auth'
import { safeRedirect, authRedirect } from './navigation'
import { registerSchema, authError } from './validation'
const mock = vi.hoisted(() => ({
  listener: null as
    null | ((event: AuthChangeEvent, session: Session | null) => void),
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
  unsubscribe: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  authConfigurationError: '',
  supabase: {
    auth: {
      getSession: mock.getSession,
      signInWithPassword: mock.signInWithPassword,
      signUp: mock.signUp,
      signOut: mock.signOut,
      updateUser: mock.updateUser,
      resetPasswordForEmail: mock.resetPasswordForEmail,
      resend: mock.resend,
      onAuthStateChange: (fn: typeof mock.listener) => {
        mock.listener = fn
        return { data: { subscription: { unsubscribe: mock.unsubscribe } } }
      },
    },
  },
}))
const session = {
  access_token: 'test',
  refresh_token: 'test-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'user-a',
    aud: 'authenticated',
    app_metadata: {},
    created_at: '2026-09-29',
    email: 'a@example.com',
    email_confirmed_at: '2026-09-29',
    user_metadata: { display_name: 'An' },
  },
} as Session
beforeEach(() => {
  vi.resetAllMocks()
  mock.listener = null
  setActivePinia(createPinia())
  vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5173' } })
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null })
})
afterEach(() => vi.unstubAllGlobals())
describe('auth boundaries', () => {
  it.each([
    'https://evil.example',
    '//evil.example',
    '/login',
    '/board?redirect=//evil',
    '/\\evil',
    [' /account'],
  ])('rejects unsafe or unsupported return targets %s', (value) =>
    expect(safeRedirect(value)).toBe('/board'),
  )
  it('preserves a supported destination and guards private routes', () => {
    expect(safeRedirect('/account')).toBe('/account')
    expect(authRedirect(true, false, '/account')).toEqual({
      path: '/login',
      query: { redirect: '/account' },
    })
    expect(authRedirect(true, true, '/account')).toBe(true)
    expect(authRedirect(false, false, '/guide')).toBe(true)
  })
  it('rejects blank names, short passwords and mismatched confirmation', () => {
    const data = {
      email: 'a@example.com',
      displayName: 'An',
      password: '12345678',
      confirmPassword: '12345678',
    }
    expect(registerSchema.safeParse(data).success).toBe(true)
    expect(
      registerSchema.safeParse({ ...data, displayName: '  ' }).success,
    ).toBe(false)
    expect(registerSchema.safeParse({ ...data, password: '123' }).success).toBe(
      false,
    )
    expect(
      registerSchema.safeParse({ ...data, confirmPassword: 'different' })
        .success,
    ).toBe(false)
  })
  it('does not expose raw server errors', () =>
    expect(authError(new Error('secret internal details'))).not.toContain(
      'secret',
    ))
  it('restores session once and responds to signout', async () => {
    mock.getSession.mockResolvedValue({ data: { session }, error: null })
    const auth = useAuthStore()
    await Promise.all([auth.initialize(), auth.initialize()])
    expect(mock.getSession).toHaveBeenCalledTimes(1)
    expect(auth.authenticated).toBe(true)
    mock.listener!('SIGNED_OUT', null)
    expect(auth.user).toBeNull()
    auth.$dispose()
    expect(mock.unsubscribe).toHaveBeenCalledOnce()
  })
  it('does not overwrite a newer signout event with a stale session read', async () => {
    let resolve!: (value: unknown) => void
    mock.getSession.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const auth = useAuthStore()
    const pending = auth.initialize()
    mock.listener!('SIGNED_OUT', null)
    resolve({ data: { session }, error: null })
    await pending
    expect(auth.user).toBeNull()
  })
  it('reports initialization failure and releases loading', async () => {
    mock.getSession.mockRejectedValue(new Error('offline'))
    const auth = useAuthStore()
    await auth.initialize()
    expect(auth.ready).toBe(true)
    expect(auth.initializationError).not.toBe('')
  })
  it('keeps registration without session in verification state', async () => {
    mock.signUp.mockResolvedValue({ data: { session: null }, error: null })
    const auth = useAuthStore()
    expect(
      await auth.register({
        email: 'a@example.com',
        displayName: 'An',
        password: '12345678',
        confirmPassword: '12345678',
      }),
    ).toBe(true)
    expect(auth.authenticated).toBe(false)
    expect(auth.notice).toContain('xác minh')
  })
  it('prevents duplicate login requests and releases pending after failure', async () => {
    let resolve!: (value: unknown) => void
    mock.signInWithPassword.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const auth = useAuthStore()
    const input = { email: 'a@example.com', password: 'wrong' }
    const first = auth.login(input)
    expect(await auth.login(input)).toBe(false)
    expect(mock.signInWithPassword).toHaveBeenCalledOnce()
    resolve({ error: { code: 'invalid_credentials' } })
    expect(await first).toBe(false)
    expect(auth.pending).toBe(false)
    expect(auth.error).toContain('không đúng')
  })
  it('keeps session when logout fails', async () => {
    mock.getSession.mockResolvedValue({ data: { session }, error: null })
    mock.signOut.mockResolvedValue({ error: new Error('offline') })
    const auth = useAuthStore()
    await auth.initialize()
    expect(await auth.logout()).toBe(false)
    expect(auth.authenticated).toBe(true)
  })
  it('requires a session for password updates', async () => {
    const auth = useAuthStore()
    expect(
      await auth.resetPassword({
        password: 'new-password',
        confirmPassword: 'new-password',
      }),
    ).toBe(false)
    expect(mock.updateUser).not.toHaveBeenCalled()
  })
  it('updates password after recovery and clears recovery state', async () => {
    mock.updateUser.mockResolvedValue({
      data: { user: session.user },
      error: null,
    })
    const auth = useAuthStore()
    await auth.initialize()
    mock.listener!('PASSWORD_RECOVERY', session)
    expect(auth.recovering).toBe(true)
    expect(
      await auth.resetPassword({
        password: 'new-password',
        confirmPassword: 'new-password',
      }),
    ).toBe(true)
    expect(auth.recovering).toBe(false)
  })
  it('uses the configured reset route in emails', async () => {
    mock.resetPasswordForEmail.mockResolvedValue({ error: null })
    const auth = useAuthStore()
    await auth.requestReset('a@example.com')
    expect(mock.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', {
      redirectTo: 'http://127.0.0.1:5173/reset-password',
    })
  })
})
