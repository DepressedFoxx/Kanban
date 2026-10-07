<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import {
  BookOpen,
  LayoutDashboard,
  UserRound,
  ListTodo,
  Bell,
} from '@lucide/vue'
import { useNotificationsStore } from '@/stores/notifications'
import { appConfig } from '@/config/app'
import { authConfig } from '@/features/auth/config'
import { workspaceConfig } from '@/features/workspaces/config'
import { useAuthStore } from '@/stores/auth'
const route = useRoute()
defineProps<{ hideAccount?: boolean }>()
const auth = useAuthStore()
const notifications = useNotificationsStore()
const emit = defineEmits<{ navigate: [] }>()
</script>
<template>
  <nav class="flex flex-col gap-2" aria-label="Điều hướng chính">
    <RouterLink
      v-if="auth.authenticated"
      to="/notifications"
      class="nav-link"
      @click="emit('navigate')"
      ><Bell :size="17" class="shrink-0" aria-hidden="true" />Thông báo<span
        v-if="notifications.feed?.unread"
        class="ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground"
        :aria-label="notifications.feed.unread + ' thông báo chưa đọc'"
        >{{
          notifications.feed.unread > 99 ? '99+' : notifications.feed.unread
        }}</span
      ></RouterLink
    >
    <RouterLink
      v-if="auth.authenticated"
      to="/my-tasks"
      class="nav-link"
      @click="emit('navigate')"
      ><ListTodo :size="17" class="shrink-0" aria-hidden="true" />Công việc của
      tôi</RouterLink
    >
    <RouterLink
      v-if="auth.authenticated"
      :to="workspaceConfig.listPath"
      :class="{
        'router-link-active':
          route.path.startsWith('/workspaces') ||
          route.path.startsWith('/boards/'),
      }"
      :aria-current="
        route.path.startsWith('/workspaces') ||
        route.path.startsWith('/boards/')
          ? 'location'
          : undefined
      "
      class="nav-link"
      @click="emit('navigate')"
      ><LayoutDashboard
        :size="17"
        class="shrink-0"
        aria-hidden="true"
      />Workspace &amp; board</RouterLink
    >
    <RouterLink
      :to="appConfig.routes.guide"
      class="nav-link"
      @click="emit('navigate')"
      ><BookOpen :size="17" class="shrink-0" aria-hidden="true" />Hướng
      dẫn</RouterLink
    >
    <RouterLink
      v-if="auth.authenticated && !hideAccount"
      :to="authConfig.routes.account"
      class="nav-link"
      @click="emit('navigate')"
      ><UserRound :size="17" class="shrink-0" aria-hidden="true" />Tài
      khoản</RouterLink
    >
  </nav>
</template>
