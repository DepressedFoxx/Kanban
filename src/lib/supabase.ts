import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { authConfig } from '@/features/auth/config'
// Capture provider error before the SDK clears the callback fragment. Never retain tokens.
export const authLinkError =
  typeof window !== 'undefined' &&
  [authConfig.routes.callback, authConfig.routes.reset].includes(
    window.location.pathname as '/auth/callback' | '/reset-password',
  ) &&
  (new URLSearchParams(window.location.hash.slice(1)).has('error') ||
    new URLSearchParams(window.location.search).has('error'))
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
let client: SupabaseClient | null = null
let configError = ''
if (!url || !key) {
  configError =
    'Đăng nhập chưa được cấu hình. Bạn có thể khám phá bảng demo trong lúc chờ kết nối dịch vụ.'
} else {
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol))
      throw new Error('Invalid URL')
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([
                  init.signal,
                  AbortSignal.timeout(authConfig.requestTimeoutMs),
                ])
              : AbortSignal.timeout(authConfig.requestTimeoutMs),
          }),
      },
    })
  } catch {
    configError =
      'Cấu hình dịch vụ đăng nhập không hợp lệ. Vui lòng kiểm tra thiết lập Supabase.'
  }
}
export const supabase = client
export const authConfigurationError = configError
