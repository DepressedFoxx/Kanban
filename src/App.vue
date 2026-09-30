<script setup lang="ts">
import { appConfig } from '@/config/app'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { authConfig } from '@/features/auth/config'
import { workspaceConfig } from '@/features/workspaces/config'
import { computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaces'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import {
  Columns3,
  LayoutDashboard,
  BookOpen,
  ArrowUpRight,
  Sprout,
} from '@lucide/vue'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const workspaces = useWorkspaceStore()
const onlineBoard = useOnlineBoardStore()
const workspaceScreen = computed(
  () =>
    route.path.startsWith('/workspaces') ||
    route.path.startsWith('/invite/') ||
    route.path.startsWith('/boards/'),
)
const workspaceLabel = computed(() =>
  workspaceScreen.value
    ? (workspaces.current?.name ??
      onlineBoard.snapshot?.board.name ??
      'Workspace')
    : appConfig.workspaceName,
)
async function logout() {
  if (await auth.logout()) await router.replace(authConfig.routes.login)
}
</script>

<template>
  <RouterView v-if="route.meta.authLayout" :key="route.path" />
  <div v-else class="app-shell">
    <aside class="sidebar">
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
      <nav
        class="mt-7 flex flex-wrap gap-2 lg:flex-col"
        aria-label="Điều hướng chính"
      >
        <RouterLink
          v-if="auth.authenticated"
          :to="workspaceConfig.listPath"
          class="nav-link"
          >Workspace &amp; board</RouterLink
        >
        <RouterLink :to="'/personal-board'" class="nav-link"
          ><LayoutDashboard :size="17" />Board cá nhân cũ</RouterLink
        ><RouterLink :to="appConfig.routes.guide" class="nav-link"
          ><BookOpen :size="17" />Hướng dẫn</RouterLink
        >
        <RouterLink
          v-if="auth.authenticated"
          :to="authConfig.routes.account"
          class="nav-link"
          >Tài khoản</RouterLink
        >
      </nav>
      <div class="mt-auto hidden pt-12 lg:block">
        <div class="rounded-xl bg-[#e9eee6] p-4">
          <Sprout :size="22" class="text-primary" />
          <p class="mt-3 text-sm font-medium">Từng bước, cùng nhau.</p>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">
            Bắt đầu nhỏ. Giữ tập trung. Hoàn thành điều quan trọng.
          </p>
          <RouterLink
            :to="appConfig.routes.guide"
            class="mt-4 flex items-center gap-2 text-xs font-medium text-primary"
            >Khám phá cách dùng<ArrowUpRight :size="14"
          /></RouterLink>
        </div>
        <p class="mt-5 text-[11px] text-muted-foreground">
          Kanban · Workspace của bạn
        </p>
      </div>
    </aside>
    <div class="min-w-0">
      <header
        class="flex min-h-17 flex-wrap items-center justify-between gap-4 border-b border-border bg-white px-5 py-3 lg:px-9"
      >
        <p class="text-xs text-muted-foreground">
          {{ workspaceLabel }}
          <span class="mx-2 text-stone-300">/</span> Không gian làm việc
        </p>
        <span
          class="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground"
          ><span class="size-1.5 rounded-full bg-emerald-600" />{{
            workspaceScreen ? 'Workspace online' : 'Board local'
          }}</span
        >
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="auth.authenticated"
            ><RouterLink
              :to="authConfig.routes.account"
              class="max-w-36 truncate text-sm"
              >{{
                auth.user?.user_metadata?.display_name || auth.user?.email
              }}</RouterLink
            ><Button
              variant="outline"
              size="sm"
              :disabled="auth.pending"
              @click="logout"
              >Đăng xuất</Button
            ></template
          ><Button v-else as-child size="sm"
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
