import { beforeEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskThreadStore } from '@/stores/taskThread'
import { commentBodySchema, isOverdue, localDateKey, taskLink } from './model'
import { safeRedirect, authRedirect } from '@/features/auth/navigation'
const api = vi.hoisted(() => ({
  thread: vi.fn(),
  comment: vi.fn(),
  change: vi.fn(),
}))
vi.mock('./api', () => ({ tasksApi: api }))
const board = '20000000-0000-4000-8000-000000000001',
  task = '30000000-0000-4000-8000-000000000001'
const empty = () => ({ can_comment: true, comments: [], activity: [] })
const item = (id: string) => ({
  id,
  actor_id: board,
  actor_name: 'An',
  body: 'Hello',
  created_at: '2026-09-30T01:00:00Z',
})
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  api.thread.mockResolvedValue(empty())
})
describe('task thread state', () => {
  it('ignores responses after leaving a task or logging out', async () => {
    let finish!: (v: unknown) => void
    api.thread.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const store = useTaskThreadStore(),
      request = store.load(board, task)
    store.clear()
    finish({ ...empty(), comments: [item(task)] })
    await request
    expect(store.comments).toEqual([])
    expect(store.canComment).toBe(false)
  })
  it('blocks duplicate submissions and retries the original comment ID/body', async () => {
    const store = useTaskThreadStore()
    await store.load(board, task)
    api.comment
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce({ ...empty(), comments: [item(task)] })
    expect(await store.comment(board, task, ' Hello ')).toBe(false)
    expect(store.uncertain?.body).toBe('Hello')
    expect(await store.comment(board, task, 'Different')).toBe(false)
    expect(await store.retry()).toBe(true)
    expect(api.comment.mock.calls[1]).toEqual(api.comment.mock.calls[0])
    expect(store.comments).toHaveLength(1)
    expect(store.uncertain).toBeNull()
  })
  it('does not allow a stale background read to undo a new comment', async () => {
    const store = useTaskThreadStore()
    await store.load(board, task)
    let finish!: (v: unknown) => void
    api.thread.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const request = store.load(board, task, 'latest', true)
    api.comment.mockResolvedValue({ ...empty(), comments: [item(task)] })
    await store.comment(board, task, 'Hello')
    finish(empty())
    await request
    expect(store.comments).toHaveLength(1)
  })
  it('clears private discussion when access is revoked', async () => {
    const store = useTaskThreadStore()
    api.thread.mockResolvedValue({ ...empty(), comments: [item(task)] })
    await store.load(board, task)
    api.thread.mockRejectedValue({ code: '42501' })
    await store.load(board, task, 'latest', true)
    expect(store.denied).toBe(true)
    expect(store.comments).toEqual([])
    expect(store.canComment).toBe(false)
  })
  it('keeps earlier pages while merging new comments without duplicates', async () => {
    const store = useTaskThreadStore()
    api.thread.mockResolvedValue({ ...empty(), comments: [item(task)] })
    await store.load(board, task)
    api.thread.mockResolvedValue({
      ...empty(),
      comments: [item(board), item(task)],
    })
    await store.load(board, task, 'latest', true)
    expect(store.comments).toHaveLength(2)
    api.thread.mockRejectedValue(new Error('offline'))
    await store.load(board, task, 'latest', true)
    expect(store.comments).toHaveLength(2)
    expect(store.syncError).not.toBe('')
  })
  it('rejects whitespace comments and keeps failed archive submissions out of retry state', async () => {
    const store = useTaskThreadStore()
    await store.load(board, task)
    expect(await store.comment(board, task, ' ')).toBe(false)
    expect(api.comment).not.toHaveBeenCalled()
    api.comment.mockRejectedValue({ code: '22023', message: 'TASK_ARCHIVED' })
    await store.comment(board, task, 'Hello')
    expect(store.canComment).toBe(false)
    expect(store.uncertain).toBeNull()
  })
})
describe('task links and calendar dates', () => {
  it('preserves only exact task links through login', () => {
    const link = taskLink(board, task)
    expect(safeRedirect(link)).toBe(link)
    expect(authRedirect(true, false, link)).toEqual({
      path: '/login',
      query: { redirect: link },
    })
    for (const suffix of ['&redirect=//evil', '&task=' + task, '#fragment'])
      expect(safeRedirect(link + suffix)).toBe('/board')
  })
  it('uses local calendar days, not UTC timestamps, and excludes completed work', () => {
    const today = new Date(2026, 8, 30, 0, 1)
    expect(localDateKey(today)).toBe('2026-09-30')
    expect(isOverdue('2026-09-29', 'todo', today)).toBe(true)
    expect(isOverdue('2026-09-30', 'todo', today)).toBe(false)
    expect(isOverdue('2026-09-29', 'done', today)).toBe(false)
    expect(isOverdue(null, 'todo', today)).toBe(false)
    expect(commentBodySchema.safeParse('a'.repeat(2001)).success).toBe(false)
  })
})

it('blocks offline comment retry without replacing its original receipt', async () => {
  const store = useTaskThreadStore()
  await store.load(board, task)
  api.comment.mockRejectedValueOnce(new Error('SYNC_TIMEOUT'))
  await store.comment(board, task, 'Keep me')
  const receipt = store.uncertain?.id
  vi.stubGlobal('navigator', { onLine: false })
  try {
    expect(await store.retry()).toBe(false)
    expect(store.uncertain?.id).toBe(receipt)
    expect(api.comment).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('comment edit retry uses detached payload after losing response', async () => {
  const store = useTaskThreadStore()
  await store.load(board, task)
  const change = {
    comment: task,
    version: 2,
    action: 'edit' as const,
    body: 'Saved body',
    reason: null,
  }
  api.change
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce({
      ...empty(),
      comments: [{ ...item(task), body: 'Saved body', version: 3 }],
    })
  expect(await store.change(board, task, change)).toBe(false)
  change.body = 'New draft'
  expect(await store.retry()).toBe(true)
  expect(api.change.mock.calls[1]).toEqual(api.change.mock.calls[0])
  expect(api.change.mock.calls[1]?.[3].body).toBe('Saved body')
  expect(store.comments[0]?.body).toBe('Saved body')
})
it('latest refresh evicts old loaded comment pages to avoid retaining deleted text', async () => {
  const store = useTaskThreadStore()
  api.thread.mockResolvedValue({ ...empty(), comments: [item(task)] })
  await store.load(board, task)
  api.thread.mockResolvedValue({
    ...empty(),
    comments: [{ ...item(board), body: null, deleted_at: '2026-10-02' }],
  })
  await store.load(board, task, 'latest', true)
  expect(store.comments).toHaveLength(1)
  expect(store.comments[0]?.body).toBeNull()
})
