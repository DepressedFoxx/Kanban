import { appConfig } from '@/config/app'
import { authConfig } from './config'
// Explicit allowlist prevents external redirects and auth redirect loops.
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' &&
    [appConfig.routes.board, authConfig.routes.account].includes(
      value as '/board' | '/account',
    )
    ? value
    : appConfig.routes.board
}
export function authRedirect(
  requiresAuth: boolean,
  authenticated: boolean,
  destination: string,
) {
  return requiresAuth && !authenticated
    ? {
        path: authConfig.routes.login,
        query: { redirect: safeRedirect(destination) },
      }
    : true
}
