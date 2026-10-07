import { ref } from 'vue'
import { defineStore } from 'pinia'
import { myTasksApi } from '@/features/my-tasks/api'
import {
  defaultFilters,
  filtersSchema,
  myTasksError,
  type TaskFilters,
  type TaskResults,
  type FilterMutation,
} from '@/features/my-tasks/model'
import {
  isOffline,
  isDefinitiveFailure,
  isAccessDenied,
} from '@/features/sync/request'
export const useMyTasksStore = defineStore('my-tasks', () => {
  const result = ref<TaskResults | null>(null),
    filters = ref<TaskFilters>(defaultFilters()),
    page = ref(1),
    pageSize = ref(20)
  const loading = ref(false),
    refreshing = ref(false),
    pending = ref(false),
    error = ref(''),
    writeError = ref(''),
    notice = ref(''),
    lastSyncedAt = ref('')
  const uncertain = ref<FilterMutation | null>(null)
  let readGeneration = 0,
    writeGeneration = 0
  function clear() {
    readGeneration++
    writeGeneration++
    result.value = null
    filters.value = defaultFilters()
    page.value = 1
    pageSize.value = 20
    loading.value = false
    refreshing.value = false
    pending.value = false
    uncertain.value = null
    error.value = ''
    writeError.value = ''
    notice.value = ''
    lastSyncedAt.value = ''
  }
  async function load(
    next: TaskFilters = filters.value,
    nextPage = page.value,
    background = false,
    nextPageSize = pageSize.value,
  ) {
    if (
      background &&
      (loading.value || refreshing.value || pending.value || uncertain.value)
    )
      return false
    const generation = ++readGeneration
    if (!background) result.value = null
    loading.value = !background
    refreshing.value = background
    error.value = ''
    try {
      filters.value = filtersSchema.parse(next)
      page.value = nextPage
      pageSize.value = nextPageSize
      const data = await myTasksApi.query(filters.value, nextPage, nextPageSize)
      if (generation !== readGeneration) return false
      result.value = data
      page.value = data.page
      pageSize.value = data.limit
      lastSyncedAt.value = new Date().toISOString()
      return true
    } catch (cause) {
      if (generation === readGeneration) {
        result.value = null
        error.value = myTasksError(cause)
      }
      return false
    } finally {
      if (generation === readGeneration) {
        loading.value = false
        refreshing.value = false
      }
    }
  }
  async function send(m: FilterMutation) {
    if (isOffline()) {
      writeError.value = 'Đang offline. Kết nối lại trước khi lưu bộ lọc.'
      return false
    }
    const generation = ++writeGeneration
    pending.value = true
    writeError.value = ''
    notice.value = ''
    try {
      await myTasksApi.mutate(m)
      if (generation !== writeGeneration) return false
      uncertain.value = null
      notice.value = m.action === 'save' ? 'Đã lưu bộ lọc.' : 'Đã xóa bộ lọc.'
      await load(filters.value, page.value)
      return true
    } catch (cause) {
      if (generation !== writeGeneration) return false
      uncertain.value = isDefinitiveFailure(cause) ? null : m
      if (isAccessDenied(cause)) {
        readGeneration++
        result.value = null
      }
      writeError.value = myTasksError(cause)
      return false
    } finally {
      if (generation === writeGeneration) pending.value = false
    }
  }
  async function save(m: Omit<FilterMutation, 'mutation'>) {
    if (pending.value || uncertain.value) return false
    return send(
      JSON.parse(JSON.stringify({ ...m, mutation: crypto.randomUUID() })),
    )
  }
  async function retry() {
    return uncertain.value && !pending.value ? send(uncertain.value) : false
  }
  return {
    result,
    filters,
    page,
    pageSize,
    loading,
    refreshing,
    pending,
    error,
    writeError,
    notice,
    lastSyncedAt,
    uncertain,
    clear,
    load,
    save,
    retry,
  }
})
