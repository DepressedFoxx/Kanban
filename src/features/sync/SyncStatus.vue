<script setup lang="ts">
import { computed } from 'vue'
import { syncStatus, type SyncInput } from './status'
const props = defineProps<{
  value: SyncInput
  connection?: string
  compact?: boolean
}>()
const status = computed(() => syncStatus(props.value))
const time = computed(() =>
  props.value.lastSyncedAt
    ? new Date(props.value.lastSyncedAt).toLocaleTimeString('vi-VN')
    : '',
)
</script>
<template>
  <div
    class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    :data-sync-state="status.kind"
  >
    <p
      role="status"
      aria-live="polite"
      :class="{
        'text-warning': ['uncertain', 'offline', 'stale'].includes(status.kind),
        'text-destructive': status.kind === 'error',
      }"
    >
      {{ status.label }}
    </p>
    <details v-if="compact && (connection || time)">
      <summary class="cursor-pointer">Chi tiết đồng bộ</summary>
      <p v-if="connection" class="mt-2">{{ connection }}</p>
      <time v-if="time" :datetime="value.lastSyncedAt"
        >Lần xác nhận gần nhất: {{ time }}</time
      >
    </details>
    <span v-if="connection && !compact">{{ connection }}</span>
    <time v-if="time && !compact" :datetime="value.lastSyncedAt"
      >Lần xác nhận gần nhất: {{ time }}</time
    >
  </div>
</template>
