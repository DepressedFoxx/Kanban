import { ref } from 'vue'
import { defineStore } from 'pinia'
import { notificationsApi } from '@/features/notifications/api'
import {
  notificationError,
  type Feed,
  type Mutation,
} from '@/features/notifications/model'
import { isOffline, isDefinitiveFailure } from '@/features/sync/request'
export const useNotificationsStore = defineStore('notifications', () => {
  const feed = ref<Feed | null>(null),
    before = ref<string | null>(null),
    unreadOnly = ref(false),
    revision = ref(0)
  const loading = ref(false),
    refreshing = ref(false),
    pending = ref(false),
    error = ref(''),
    writeError = ref(''),
    notice = ref('')
  const uncertain = ref<Mutation | null>(null)
  const page = ref(1),
    pageSize = ref(20)
  let readGeneration = 0,
    writeGeneration = 0
  function clear() {
    readGeneration++
    writeGeneration++
    feed.value = null
    before.value = null
    page.value = 1
    pageSize.value = 20
    unreadOnly.value = false
    loading.value = false
    refreshing.value = false
    pending.value = false
    error.value = ''
    writeError.value = ''
    notice.value = ''
    uncertain.value = null
    revision.value++
  }
  async function load(
    cursor = before.value,
    unread = unreadOnly.value,
    background = false,
    nextPage = page.value,
    nextSize = pageSize.value,
  ) {
    if (
      background &&
      (loading.value || refreshing.value || pending.value || uncertain.value)
    )
      return false
    const generation = ++readGeneration
    before.value = cursor
    unreadOnly.value = unread
    if (!background) feed.value = null
    loading.value = !background
    refreshing.value = background
    error.value = ''
    try {
      const result = await notificationsApi.feed(nextPage, unread, nextSize)
      if (generation !== readGeneration) return false
      feed.value = result
      page.value = result.page
      pageSize.value = result.pageSize
      revision.value++
      return true
    } catch (cause) {
      if (generation === readGeneration) {
        feed.value = null
        error.value = notificationError(cause)
      }
      return false
    } finally {
      if (generation === readGeneration) {
        loading.value = false
        refreshing.value = false
      }
    }
  }
  async function send(m: Mutation) {
    if (isOffline()) {
      writeError.value = 'Đang offline. Kết nối lại trước khi cập nhật.'
      return false
    }
    const generation = ++writeGeneration
    pending.value = true
    writeError.value = ''
    notice.value = ''
    try {
      await notificationsApi.mutate(m)
      if (generation !== writeGeneration) return false
      uncertain.value = null
      notice.value =
        m.action === 'accept' ? 'Đã tham gia workspace.' : 'Đã cập nhật.'
      await load()
      return true
    } catch (cause) {
      if (generation !== writeGeneration) return false
      uncertain.value = isDefinitiveFailure(cause) ? null : m
      writeError.value = notificationError(cause)
      // Drop cached payloads when writes reveal lost permission.
      if ((cause as { code?: string })?.code === '42501') {
        readGeneration++
        feed.value = null
      }
      return false
    } finally {
      if (generation === writeGeneration) pending.value = false
    }
  }
  async function mutate(
    action: Exclude<Mutation['action'], 'accept'>,
    data: Record<string, unknown>,
  ) {
    if (pending.value || uncertain.value) return false
    return send(
      JSON.parse(
        JSON.stringify({ action, data, mutation: crypto.randomUUID() }),
      ),
    )
  }
  async function accept(invitation: string) {
    if (pending.value || uncertain.value) return false
    return send({ action: 'accept', invitation })
  }
  async function retry() {
    return uncertain.value && !pending.value ? send(uncertain.value) : false
  }
  return {
    feed,
    page,
    pageSize,
    before,
    unreadOnly,
    revision,
    loading,
    refreshing,
    pending,
    error,
    writeError,
    notice,
    uncertain,
    clear,
    load,
    mutate,
    accept,
    retry,
  }
})
