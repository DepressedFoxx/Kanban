import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { supabase } from '@/lib/supabase'
import { createSync, type ChangeFilter, type ConnectionState } from './sync'
export function useCollab(
  filters: () => ChangeFilter[],
  refresh: () => Promise<boolean>,
  enabled: () => boolean,
) {
  const state = ref<ConnectionState>('connecting')
  const online = ref(navigator.onLine)
  let sync: ReturnType<typeof createSync> | undefined
  const wake = () => {
    online.value = navigator.onLine
    sync?.connection(online.value)
  }
  const available = () => navigator.onLine && !document.hidden
  watch(
    () => JSON.stringify([enabled(), filters()]),
    () => {
      sync?.stop()
      sync = undefined
      if (!enabled()) {
        state.value = 'fallback'
        return
      }
      sync = createSync({
        client: supabase,
        filters: filters(),
        refresh,
        available,
        state: (value) => {
          state.value = navigator.onLine ? value : 'offline'
        },
      })
      if (!navigator.onLine) sync.connection(false)
    },
    { immediate: true },
  )
  window.addEventListener('online', wake)
  window.addEventListener('offline', wake)
  window.addEventListener('focus', wake)
  document.addEventListener('visibilitychange', wake)
  onBeforeUnmount(() => {
    sync?.stop()
    window.removeEventListener('online', wake)
    window.removeEventListener('offline', wake)
    window.removeEventListener('focus', wake)
    document.removeEventListener('visibilitychange', wake)
  })
  const label = computed(
    () =>
      ({
        connecting: 'Đang kết nối cập nhật trực tiếp…',
        live: 'Cập nhật trực tiếp đang bật',
        fallback: 'Đang kiểm tra cập nhật định kỳ',
        offline: 'Mất kết nối — đang xem dữ liệu đã tải',
      })[state.value],
  )
  return { state, label, online }
}
