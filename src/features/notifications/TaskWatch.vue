<script setup lang="ts">
import RefreshButton from '@/components/RefreshButton.vue'
import { ref, watch, onBeforeUnmount } from 'vue'
import { Button } from '@/components/ui/button'
import { useNotificationsStore } from '@/stores/notifications'
import { notificationsApi } from './api'
import { notificationError, type WatchState } from './model'
const props = defineProps<{ task: string }>(),
  store = useNotificationsStore()
const state = ref<WatchState | null>(null),
  error = ref(''),
  loading = ref(false)
let generation = 0
async function load() {
  const request = ++generation
  loading.value = true
  error.value = ''
  try {
    const data = await notificationsApi.watch(props.task)
    if (request === generation) state.value = data
  } catch (cause) {
    if (request === generation) {
      state.value = null
      error.value = notificationError(cause)
    }
  } finally {
    if (request === generation) loading.value = false
  }
}
watch(
  () => [props.task, store.revision],
  () => {
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
})
async function toggle() {
  if (!state.value) return
  if (
    await store.mutate('watch', {
      task: props.task,
      version: state.value.version,
      enabled: !state.value.enabled,
    })
  )
    await load()
}
</script>
<template>
  <div class="space-y-2">
    <Button
      v-if="state"
      type="button"
      variant="outline"
      :aria-pressed="state.enabled"
      :disabled="loading || store.pending || !!store.uncertain"
      @click="toggle"
      >{{ state.enabled ? 'Bỏ theo dõi task' : 'Theo dõi task' }}</Button
    >
    <p v-if="state" class="text-xs text-muted-foreground">
      {{
        state.automatic
          ? 'Mặc định: người được giao việc nhận bình luận mới.'
          : 'Đang dùng lựa chọn theo dõi riêng của bạn.'
      }}
    </p>
    <p v-if="error" class="text-sm text-destructive" role="status">
      {{ error }}
    </p>
    <RefreshButton
      v-if="error"
      type="button"
      variant="ghost"
      :disabled="loading"
      @click="load"
      label="Tải lại theo dõi"
    />
    <p v-if="store.writeError" role="alert" class="text-sm text-destructive">
      {{ store.writeError }}
    </p>
  </div>
</template>
