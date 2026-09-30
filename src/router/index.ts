import { watch } from 'vue'
import type { Pinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { appConfig } from '@/config/app'
import { authConfig } from '@/features/auth/config'
import { authRedirect, safeRedirect } from '@/features/auth/navigation'
import { useBoardStore } from '@/stores/board'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspaces'
import { workspaceConfig } from '@/features/workspaces/config'
const authView = () => import('@/features/auth/views/AuthView.vue')
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: workspaceConfig.listPath,
      component: () => import('@/features/workspaces/views/WorkspacesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/workspaces/:workspaceId/members',
      component: () => import('@/features/workspaces/views/MembersView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/invite/:token',
      component: () =>
        import('@/features/workspaces/views/AcceptInviteView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/', redirect: appConfig.routes.board },
    {
      path: appConfig.routes.board,
      component: () => import('@/views/BoardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: appConfig.routes.demo,
      component: () => import('@/views/BoardView.vue'),
    },
    {
      path: appConfig.routes.guide,
      component: () => import('@/views/GuideView.vue'),
    },
    {
      path: authConfig.routes.account,
      component: () => import('@/features/auth/views/AccountView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: authConfig.routes.login,
      component: authView,
      meta: { authLayout: true, authMode: 'login', guestOnly: true },
    },
    {
      path: authConfig.routes.register,
      component: authView,
      meta: { authLayout: true, authMode: 'register', guestOnly: true },
    },
    {
      path: authConfig.routes.forgot,
      component: authView,
      meta: { authLayout: true, authMode: 'forgot' },
    },
    {
      path: authConfig.routes.reset,
      component: authView,
      meta: { authLayout: true, authMode: 'reset' },
    },
    {
      path: authConfig.routes.callback,
      component: () => import('@/features/auth/views/CallbackView.vue'),
      meta: { authLayout: true },
    },
    { path: '/:pathMatch(.*)*', redirect: appConfig.routes.board },
  ],
})
export function installAuthGuards(pinia: Pinia) {
  const auth = useAuthStore(pinia)
  const stopIdentityWatch = watch(
    () => auth.user?.id,
    () => {
      useBoardStore(pinia).clear()
      useWorkspaceStore(pinia).clear()
    },
    { flush: 'sync' },
  )
  const removeGuard = router.beforeEach(async (to) => {
    await auth.initialize()
    if (auth.recovering && to.path !== authConfig.routes.reset)
      return authConfig.routes.reset
    const result = authRedirect(
      Boolean(to.meta.requiresAuth),
      auth.authenticated,
      to.path,
    )
    if (result !== true) return result
    if (to.meta.guestOnly && auth.authenticated)
      return safeRedirect(to.query.redirect)
    return true
  })
  const stopSessionWatch = watch(
    [() => auth.authenticated, () => auth.recovering],
    ([authenticated, recovering]) => {
      if (!auth.ready) return
      if (recovering) {
        void router.replace(authConfig.routes.reset)
        return
      }
      const route = router.currentRoute.value
      if (!authenticated && route.meta.requiresAuth)
        void router.replace({
          path: authConfig.routes.login,
          query: { redirect: safeRedirect(route.path) },
        })
    },
  )
  return () => {
    stopIdentityWatch()
    stopSessionWatch()
    removeGuard()
  }
}
