<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import { useCollab } from '@/features/collab/useCollab'
import { Button } from '@/components/ui/button'
const store = useNotificationsStore(),
  auth = useAuthStore()
const { online } = useCollab(
  () => [
    {
      table: 'notification_signals',
      event: 'INSERT',
      filter: 'user_id=eq.' + auth.user?.id,
    },
    {
      table: 'notification_signals',
      event: 'UPDATE',
      filter: 'user_id=eq.' + auth.user?.id,
    },
    { table: 'boards', event: 'UPDATE', filter: '' },
    { table: 'workspaces', event: 'UPDATE', filter: '' },
  ],
  () => store.load(store.before, store.unreadOnly, true),
  () => auth.authenticated,
)
</script>
<template>
  <div
    v-if="store.uncertain"
    class="m-4 rounded-lg border bg-card p-3 text-sm"
    role="status"
  >
    Thao tác thông báo chưa rõ kết quả. Xác nhận lại để tiếp tục.
    <Button
      class="mt-2"
      :disabled="store.pending || !online"
      @click="store.retry"
      >Xác nhận lại thao tác thông báo</Button
    >
  </div>
</template>
