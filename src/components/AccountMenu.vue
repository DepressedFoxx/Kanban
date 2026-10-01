<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronDown, UserRound, LogOut } from '@lucide/vue'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { authConfig } from '@/features/auth/config'
defineProps<{ inline?: boolean }>()
const emit = defineEmits<{ logout: []; navigate: [] }>()
const auth = useAuthStore()
const name = computed(() =>
  String(
    auth.user?.user_metadata?.display_name ||
      auth.user?.email?.split('@')[0] ||
      'Tài khoản',
  ),
)
const initials = computed(() =>
  name.value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] || '')
    .join('')
    .toLocaleUpperCase(),
)
</script>
<template>
  <section v-if="inline" aria-label="Tài khoản" class="grid min-w-0 gap-3">
    <div class="flex min-w-0 items-center gap-3">
      <span class="profile-avatar" aria-hidden="true">{{ initials }}</span>
      <div class="min-w-0">
        <p class="break-words text-sm font-semibold">{{ name }}</p>
        <p class="break-all text-xs text-muted-foreground">
          {{ auth.user?.email }}
        </p>
      </div>
    </div>
    <Button as-child variant="ghost" class="justify-start"
      ><RouterLink :to="authConfig.routes.account" @click="emit('navigate')"
        ><UserRound :size="16" aria-hidden="true" />Thông tin tài
        khoản</RouterLink
      ></Button
    >
    <Button
      variant="ghost"
      class="justify-start text-destructive"
      :disabled="auth.pending"
      @click="emit('logout')"
      ><LogOut :size="16" aria-hidden="true" />{{
        auth.pending ? 'Đang đăng xuất…' : 'Đăng xuất'
      }}</Button
    >
  </section>
  <DropdownMenuRoot v-else>
    <DropdownMenuTrigger as-child
      ><Button
        variant="ghost"
        class="h-auto min-h-11 max-w-56 gap-2 px-2"
        aria-label="Mở menu tài khoản"
        ><span class="profile-avatar" aria-hidden="true">{{ initials }}</span
        ><span class="min-w-0 truncate">{{ name }}</span
        ><ChevronDown
          :size="16"
          class="shrink-0 text-muted-foreground"
          aria-hidden="true" /></Button
    ></DropdownMenuTrigger>
    <DropdownMenuPortal
      ><DropdownMenuContent align="end" :side-offset="8" class="account-menu">
        <div class="px-3 py-2">
          <p class="break-words text-sm font-semibold">{{ name }}</p>
          <p class="mt-1 break-all text-xs text-muted-foreground">
            {{ auth.user?.email }}
          </p>
        </div>
        <DropdownMenuSeparator class="my-1 h-px bg-border" />
        <DropdownMenuItem as-child
          ><RouterLink
            :to="authConfig.routes.account"
            class="account-menu-item"
            @click="emit('navigate')"
            ><UserRound :size="16" aria-hidden="true" />Thông tin tài
            khoản</RouterLink
          ></DropdownMenuItem
        >
        <DropdownMenuSeparator class="my-1 h-px bg-border" />
        <DropdownMenuItem
          class="account-menu-item text-destructive"
          :disabled="auth.pending"
          @select="emit('logout')"
          ><LogOut :size="16" aria-hidden="true" />{{
            auth.pending ? 'Đang đăng xuất…' : 'Đăng xuất'
          }}</DropdownMenuItem
        >
      </DropdownMenuContent></DropdownMenuPortal
    >
  </DropdownMenuRoot>
</template>
