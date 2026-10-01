import { computed, ref } from 'vue'
import {
  isOffline,
  isAccessDenied,
  isDefinitiveFailure,
} from '@/features/sync/request'
import { defineStore } from 'pinia'
import { boardsApi } from '@/features/boards/api'
import { boardError, type BoardSnapshot } from '@/features/boards/model'
type Mutation = {
  board: string
  version: number
  id: string
  action: string
  data: Record<string, unknown>
}
export const useOnlineBoardStore = defineStore('online-board', () => {
  const snapshot = ref<BoardSnapshot | null>(null)
  const loading = ref(false),
    pending = ref(false),
    error = ref(''),
    notice = ref('')
  const refreshing = ref(false)
  const syncError = ref('')
  const uncertain = ref<Mutation | null>(null)
  const lastSuccess = ref('')
  const lastSyncedAt = ref('')
  let generation = 0
  const writable = computed(() =>
    Boolean(
      snapshot.value &&
      snapshot.value.role !== 'viewer' &&
      !snapshot.value.board.archived_at &&
      !loading.value &&
      !pending.value &&
      !uncertain.value,
    ),
  )
  function clear() {
    generation++
    refreshing.value = false
    syncError.value = ''
    snapshot.value = null
    loading.value = false
    pending.value = false
    uncertain.value = null
    error.value = ''
    notice.value = ''
    lastSuccess.value = ''
    lastSyncedAt.value = ''
  }
  async function load(id: string, options: { background?: boolean } = {}) {
    if (pending.value || loading.value || refreshing.value || uncertain.value)
      return false
    const background = Boolean(
      options.background && snapshot.value?.board.id === id,
    )
    const request = ++generation
    if (background) refreshing.value = true
    else {
      loading.value = true
      error.value = ''
    }
    if (snapshot.value?.board.id !== id) {
      snapshot.value = null
      uncertain.value = null
    }
    try {
      const value = await boardsApi.snapshot(id)
      if (request !== generation) return false
      // Keep object identity when nothing changed; polling must not rebuild cards.
      if (JSON.stringify(snapshot.value) !== JSON.stringify(value))
        snapshot.value = value
      syncError.value = ''
      lastSyncedAt.value = new Date().toISOString()
      return true
    } catch (cause) {
      if (request === generation) {
        if (background && !isAccessDenied(cause)) {
          syncError.value =
            'Chưa cập nhật được dữ liệu mới. Đang giữ bản đã tải; sẽ thử lại.'
        } else {
          snapshot.value = null
          error.value = boardError(cause)
        }
      }
      return false
    } finally {
      if (request === generation) {
        loading.value = false
        refreshing.value = false
      }
    }
  }
  async function send(mutation: Mutation) {
    // A user write supersedes any older background read.
    const request = ++generation
    refreshing.value = false
    pending.value = true
    error.value = ''
    notice.value = ''
    try {
      const value = await boardsApi.mutate(
        mutation.board,
        mutation.version,
        mutation.id,
        mutation.action,
        mutation.data,
      )
      if (request !== generation) return false
      snapshot.value = value
      uncertain.value = null
      syncError.value = ''
      lastSyncedAt.value = new Date().toISOString()
      lastSuccess.value = mutation.id
      notice.value = 'Đã lưu.'
      return true
    } catch (cause) {
      if (request !== generation) return false
      const code = (cause as { code?: string })?.code
      const message = boardError(cause)
      const definitive = isDefinitiveFailure(cause)
      if (!definitive) uncertain.value = mutation
      else {
        uncertain.value = null
        if (isAccessDenied(cause)) snapshot.value = null
      }
      if (code === 'PT409' || code === '40001' || code === '22023') {
        try {
          const value = await boardsApi.snapshot(mutation.board)
          if (request === generation) snapshot.value = value
        } catch {
          if (request === generation) snapshot.value = null
        }
      }
      if (request === generation) error.value = message
      return false
    } finally {
      if (request === generation) pending.value = false
    }
  }
  async function mutate(
    action: string,
    data: Record<string, unknown>,
    version = snapshot.value?.board.version,
  ) {
    if (
      pending.value ||
      loading.value ||
      uncertain.value ||
      !snapshot.value ||
      version === undefined
    )
      return false
    if (isOffline()) {
      error.value = 'Đang offline. Kết nối lại trước khi lưu.'
      return false
    }
    return send({
      board: snapshot.value.board.id,
      version,
      id: crypto.randomUUID(),
      action,
      // Detach from reactive forms: retries must replay the exact original payload.
      data: JSON.parse(JSON.stringify(data)),
    })
  }
  async function retry() {
    if (!uncertain.value || pending.value) return false
    if (isOffline()) {
      error.value = 'Đang offline. Kết nối lại trước khi xác nhận.'
      return false
    }
    return send(uncertain.value)
  }
  return {
    snapshot,
    loading,
    refreshing,
    syncError,
    pending,
    error,
    notice,
    uncertain,
    lastSuccess,
    lastSyncedAt,
    writable,
    clear,
    load,
    mutate,
    retry,
  }
})
