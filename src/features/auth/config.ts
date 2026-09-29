export const authConfig = {
  minPasswordLength: 8,
  maxPasswordLength: 128,
  maxDisplayNameLength: 60,
  requestTimeoutMs: 15000,
  routes: {
    login: '/login',
    register: '/register',
    forgot: '/forgot-password',
    reset: '/reset-password',
    callback: '/auth/callback',
    account: '/account',
  },
} as const
