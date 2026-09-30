import { computed, ref } from 'vue'
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
  const uncertain = ref<Mutation | null>(null)
  const lastSuccess = ref('')
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
    snapshot.value = null
    loading.value = false
    pending.value = false
    uncertain.value = null
    error.value = ''
    notice.value = ''
    lastSuccess.value = ''
  }
  async function load(id: string) {
    if (pending.value || loading.value) return false
    const request = ++generation
    loading.value = true
    error.value = ''
    if (snapshot.value?.board.id !== id) { snapshot.value = null; uncertain.value = null }
    try {
      const value = await boardsApi.snapshot(id)
      if (request !== generation) return false
      snapshot.value = value
      return true
    } catch (cause) {
      if (request === generation) { snapshot.value = null; error.value = boardError(cause) }
      return false
    } finally { if (request === generation) loading.value = false }
  }
  async function send(mutation: Mutation) {
    const request = generation
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
      lastSuccess.value = mutation.id
      notice.value = 'Đã lưu trên Supabase.'
      return true
    } catch (cause) {
      if (request !== generation) return false
      const code = (cause as { code?: string })?.code
      const message = boardError(cause)
      const definitive = Boolean(code && /^(22|23|42|40|PGRST)/.test(code))
      if (!definitive) uncertain.value = mutation
      else {
        uncertain.value = null
        if (code === '42501') snapshot.value = null
      }
      if (code === '40001' || code === '22023') {
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      error.value = 'Đang offline. Kết nối lại trước khi lưu.'
      return false
    }
    return send({
      board: snapshot.value.board.id,
      version,
      id: crypto.randomUUID(),
      action,
      data,
    })
  }
  async function retry() {
    if (!uncertain.value || pending.value) return false
    return send(uncertain.value)
  }
  return {
    snapshot,
    loading,
    pending,
    error,
    notice,
    uncertain,
    lastSuccess,
    writable,
    clear,
    load,
    mutate,
    retry,
  }
})
