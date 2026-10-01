import { ref } from 'vue'
import {
  isOffline,
  isAccessDenied,
  isDefinitiveFailure,
} from '@/features/sync/request'
import { defineStore } from 'pinia'
import { tasksApi } from '@/features/tasks/api'
import {
  commentBodySchema,
  taskConfig,
  taskError,
  type TaskComment,
  type TaskActivity,
} from '@/features/tasks/model'
export const useTaskThreadStore = defineStore('task-thread', () => {
  const comments = ref<TaskComment[]>([]),
    activity = ref<TaskActivity[]>([]),
    canComment = ref(false)
  const loading = ref(false),
    refreshing = ref(false),
    pending = ref(false),
    error = ref(''),
    syncError = ref(''),
    denied = ref(false)
  const moreComments = ref(false),
    moreActivity = ref(false),
    lastSuccess = ref('')
  const uncertain = ref<{
    board: string
    task: string
    id: string
    body: string
  } | null>(null)
  const lastSyncedAt = ref('')
  let generation = 0,
    scope = ''
  function clear() {
    generation++
    scope = ''
    comments.value = []
    activity.value = []
    canComment.value = false
    loading.value = false
    refreshing.value = false
    pending.value = false
    error.value = ''
    syncError.value = ''
    denied.value = false
    uncertain.value = null
    moreComments.value = false
    moreActivity.value = false
    lastSuccess.value = ''
    lastSyncedAt.value = ''
  }
  function fail(cause: unknown, background = false) {
    if (isAccessDenied(cause)) {
      comments.value = []
      activity.value = []
      canComment.value = false
      denied.value = true
      error.value = taskError(cause)
    } else if (background)
      syncError.value = 'Chưa cập nhật được thảo luận. Đang giữ dữ liệu đã tải.'
    else error.value = taskError(cause)
  }
  function mergeComments(items: TaskComment[], latest = true) {
    if (
      latest &&
      items.length === taskConfig.pageSize &&
      !items.some((item) => comments.value.some((old) => old.id === item.id))
    ) {
      comments.value = []
      moreComments.value = true
    }

    comments.value = [
      ...new Map([...comments.value, ...items].map((c) => [c.id, c])).values(),
    ].sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )
  }
  function mergeActivity(items: TaskActivity[], latest = true) {
    if (
      latest &&
      items.length === taskConfig.pageSize &&
      !items.some((item) => activity.value.some((old) => old.id === item.id))
    ) {
      activity.value = []
      moreActivity.value = true
    }

    activity.value = [
      ...new Map([...activity.value, ...items].map((a) => [a.id, a])).values(),
    ].sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? -1 : 1))
  }
  async function load(
    board: string,
    task: string,
    mode: 'latest' | 'comments' | 'activity' = 'latest',
    background = false,
  ) {
    const key = board + ':' + task
    if (scope !== key) {
      clear()
      scope = key
    }
    if (pending.value || loading.value || refreshing.value || uncertain.value)
      return false
    const request = ++generation
    if (background) refreshing.value = true
    else {
      loading.value = true
      error.value = ''
    }
    const lastComment = comments.value.at(-1),
      lastActivity = activity.value.at(-1)
    try {
      const result = await tasksApi.thread(board, task, {
        ...(mode === 'comments' && lastComment
          ? { commentDate: lastComment.created_at, commentId: lastComment.id }
          : {}),
        ...(mode === 'activity' && lastActivity
          ? { activityId: lastActivity.id }
          : {}),
      })
      if (request !== generation) return false
      canComment.value = result.can_comment
      denied.value = false
      syncError.value = ''
      lastSyncedAt.value = new Date().toISOString()
      if (mode !== 'activity') {
        if (mode === 'comments' || !comments.value.length)
          moreComments.value = result.comments.length === taskConfig.pageSize
        mergeComments(result.comments, mode === 'latest')
      }
      if (mode !== 'comments') {
        if (mode === 'activity' || !activity.value.length)
          moreActivity.value = result.activity.length === taskConfig.pageSize
        mergeActivity(result.activity, mode === 'latest')
      }
      return true
    } catch (cause) {
      if (request === generation) fail(cause, background)
      return false
    } finally {
      if (request === generation) {
        loading.value = false
        refreshing.value = false
      }
    }
  }
  async function send(attempt: {
    board: string
    task: string
    id: string
    body: string
  }) {
    const request = ++generation
    refreshing.value = false
    pending.value = true
    error.value = ''
    try {
      const result = await tasksApi.comment(
        attempt.board,
        attempt.task,
        attempt.id,
        attempt.body,
      )
      if (request !== generation) return false
      mergeComments(result.comments)
      mergeActivity(result.activity)
      canComment.value = result.can_comment
      uncertain.value = null
      syncError.value = ''
      lastSyncedAt.value = new Date().toISOString()
      lastSuccess.value = attempt.id
      return true
    } catch (cause) {
      if (request !== generation) return false
      if (!isDefinitiveFailure(cause)) uncertain.value = attempt
      else {
        uncertain.value = null
        if ((cause as { message?: string }).message?.includes('ARCHIVED'))
          canComment.value = false
      }
      fail(cause)
      return false
    } finally {
      if (request === generation) pending.value = false
    }
  }
  async function comment(board: string, task: string, body: string) {
    if (
      pending.value ||
      loading.value ||
      uncertain.value ||
      !canComment.value ||
      scope !== board + ':' + task
    )
      return false
    if (isOffline()) {
      error.value = 'Đang offline. Kết nối lại trước khi gửi.'
      return false
    }
    try {
      return await send({
        board,
        task,
        id: crypto.randomUUID(),
        body: commentBodySchema.parse(body),
      })
    } catch (cause) {
      error.value = taskError(cause)
      return false
    }
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
    comments,
    activity,
    canComment,
    loading,
    refreshing,
    pending,
    error,
    syncError,
    denied,
    moreComments,
    moreActivity,
    lastSuccess,
    lastSyncedAt,
    uncertain,
    clear,
    load,
    comment,
    retry,
  }
})
