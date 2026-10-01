<script setup lang="ts">
import { computed } from 'vue'
import { syncStatus, type SyncInput } from './status'
const props = defineProps<{ value: SyncInput; connection?: string }>()
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
        'text-amber-800': ['uncertain', 'offline', 'stale'].includes(
          status.kind,
        ),
        'text-destructive': status.kind === 'error',
      }"
    >
      {{ status.label }}
    </p>
    <span v-if="connection">{{ connection }}</span>
    <time v-if="time" :datetime="value.lastSyncedAt"
      >Lần xác nhận gần nhất: {{ time }}</time
    >
  </div>
</template>
