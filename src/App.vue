<script setup lang="ts">
import { appConfig } from '@/config/app'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { authConfig } from '@/features/auth/config'
import { workspaceApi } from '@/features/workspaces/api'
import { computed, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import AccountMenu from '@/components/AccountMenu.vue'
import AppNavigation from '@/components/AppNavigation.vue'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useWorkspaceStore } from '@/stores/workspaces'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Columns3, Menu } from '@lucide/vue'
const menuOpen = ref(false)
const desktop = useMediaQuery('(min-width: 1024px)')

watch(desktop, (value) => {
  if (value) menuOpen.value = false
})
const auth = useAuthStore()
const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)
const router = useRouter()
const workspaces = useWorkspaceStore()
const onlineBoard = useOnlineBoardStore()
const workspaceScreen = computed(
  () =>
    route.path.startsWith('/workspaces') ||
    route.path.startsWith('/invite/') ||
    route.path.startsWith('/boards/'),
)
const workspaceNames = ref<Record<string, string>>({})
let labelRequest = 0
watch(
  [
    () => auth.user?.id,
    () => onlineBoard.snapshot?.board.workspace_id,
    () => route.params.workspaceId,
  ],
  async () => {
    const request = ++labelRequest
    workspaceNames.value = {}
    if (!auth.authenticated) return
    try {
      const list = await workspaceApi.list()
      if (request === labelRequest)
        workspaceNames.value = Object.fromEntries(
          list.map((w) => [w.id, w.name]),
        )
    } catch {
      /* Navigation stays usable if the workspace label cannot be loaded. */
    }
  },
  { immediate: true },
)
const workspaceLabel = computed(() => {
  if (route.path === '/my-tasks') return 'Công việc của tôi'
  const id = String(
    route.params.workspaceId || onlineBoard.snapshot?.board.workspace_id || '',
  )
  return workspaces.current?.id === id
    ? workspaces.current.name
    : workspaceNames.value[id] ||
        (workspaceScreen.value ? 'Workspace' : appConfig.name)
})
async function logout() {
  if (await auth.logout()) await router.replace(authConfig.routes.login)
}
</script>

<template>
  <RouterView v-if="route.meta.authLayout" :key="route.path" />
  <div v-else class="app-shell">
    <div class="mobile-navigation">
      <Dialog v-model:open="menuOpen">
        <DialogTrigger as-child>
          <Button variant="outline" size="icon" aria-label="Mở menu điều hướng"
            ><Menu :size="20"
          /></Button>
        </DialogTrigger>
        <DialogContent
          class="navigation-drawer"
          overlay-class="navigation-backdrop"
        >
          <DialogTitle>Menu điều hướng</DialogTitle>
          <DialogDescription
            >Workspace, board và tài khoản của bạn.</DialogDescription
          >
          <p class="break-words rounded-lg bg-muted p-3 text-sm">
            {{ workspaceLabel }}
          </p>
          <AppNavigation @navigate="menuOpen = false" />
          <div class="mt-auto grid gap-3 border-t pt-4">
            <template v-if="auth.authenticated"
              ><AccountMenu
                inline
                @logout="logout"
                @navigate="menuOpen = false"
              />
              <p
                v-if="auth.error"
                role="alert"
                class="text-sm text-destructive"
              >
                {{ auth.error }}
              </p></template
            >
            <Button v-else as-child
              ><RouterLink
                :to="authConfig.routes.login"
                @click="menuOpen = false"
                >Đăng nhập</RouterLink
              ></Button
            >
          </div>
        </DialogContent>
      </Dialog>
      <RouterLink
        :to="appConfig.routes.board"
        class="flex min-w-0 items-center gap-2 font-semibold"
        ><Columns3 :size="22" class="shrink-0 text-primary" />{{
          appConfig.name
        }}</RouterLink
      >
    </div>
    <aside class="sidebar desktop-sidebar">
      <RouterLink
        :to="appConfig.routes.board"
        class="flex items-center gap-3 text-lg font-semibold"
        ><span
          class="flex size-9 items-center justify-center rounded-xl bg-primary text-white"
          ><Columns3 :size="19" /></span
        >{{ appConfig.name }}<span class="text-primary">.</span></RouterLink
      >
      <div
        class="mt-9 hidden rounded-xl border border-border bg-white p-3 lg:block"
      >
        <p class="text-xs text-muted-foreground">Không gian làm việc</p>
        <p class="mt-2 flex items-center gap-2 text-sm font-medium">
          <span class="avatar">{{ workspaceLabel.slice(0, 1) }}</span
          ><span class="break-words">{{ workspaceLabel }}</span>
        </p>
      </div>
      <AppNavigation class="mt-7" />
    </aside>
    <div class="min-w-0">
      <header class="app-header">
        <p class="header-context">
          {{ workspaceLabel
          }}<template
            v-if="route.path.startsWith('/boards/') && onlineBoard.snapshot"
            ><span class="mx-2">/</span
            >{{ onlineBoard.snapshot.board.name }}</template
          >
        </p>
        <div class="header-account">
          <AccountMenu v-if="auth.authenticated" @logout="logout" /><Button
            v-else
            as-child
            size="sm"
            ><RouterLink :to="authConfig.routes.login"
              >Đăng nhập</RouterLink
            ></Button
          >
        </div>
      </header>
      <p v-if="auth.error" role="alert" class="m-4 text-sm text-destructive">
        {{ auth.error }}
      </p>
      <RouterView :key="route.path + (auth.user?.id ?? 'guest')" />
    </div>
  </div>
</template>
