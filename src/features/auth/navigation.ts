import { appConfig } from '@/config/app'
import { authConfig } from './config'
import { workspaceConfig } from '@/features/workspaces/config'
// Explicit allowlist prevents external redirects and auth redirect loops.
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return appConfig.routes.board
  const paths: string[] = [
    appConfig.routes.board,
    authConfig.routes.account,
    workspaceConfig.listPath,
    '/personal-board',
  ]
  const workspacePath =
    /^\/workspaces\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(members|boards|settings)$/i
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
  const taskPath = new RegExp(`^/boards/${uuid}\\?task=${uuid}$`, 'i')
  const invitationPath = /^\/invite\/[a-f0-9]{64}$/
  return paths.includes(value) ||
    workspacePath.test(value) ||
    taskPath.test(value) ||
    /^\/boards\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    ) ||
    invitationPath.test(value)
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
