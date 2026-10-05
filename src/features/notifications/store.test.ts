import { beforeEach, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationsStore } from '@/stores/notifications'
const api = vi.hoisted(() => ({ feed: vi.fn(), mutate: vi.fn() }))
vi.mock('./api', () => ({ notificationsApi: api }))
const empty = () => ({
  items: [],
  unread: 0,
  high_water: '0',
  next: null,
  preferences: {
    assignments: true,
    comments: true,
    invitations: true,
    version: 0,
  },
})
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  api.feed.mockResolvedValue(empty())
})
it('ignores responses from old cursor or after logout', async () => {
  const store = useNotificationsStore()
  let resolve!: (v: unknown) => void
  api.feed.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r
    }),
  )
  const first = store.load()
  await store.load('20')
  resolve({ ...empty(), unread: 99 })
  await first
  expect(store.feed?.unread).toBe(0)
  expect(store.before).toBe('20')
  api.feed.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r
    }),
  )
  const late = store.load()
  store.clear()
  resolve(empty())
  await late
  expect(store.feed).toBeNull()
})
it('failed refresh drops private payload', async () => {
  const store = useNotificationsStore()
  await store.load()
  api.feed.mockRejectedValueOnce({ code: '42501' })
  await store.load(null, false, true)
  expect(store.feed).toBeNull()
  expect(store.error).toBeTruthy()
})
it('uncertain read retries original receipt and detaches payload', async () => {
  const store = useNotificationsStore(),
    data = { id: '1', read: true, version: 1 }
  api.mutate.mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({})
  expect(await store.mutate('read', data)).toBe(false)
  data.read = false
  expect(await store.mutate('read', data)).toBe(false)
  expect(await store.retry()).toBe(true)
  expect(api.mutate.mock.calls[1]).toEqual(api.mutate.mock.calls[0])
  expect(api.mutate.mock.calls[0]![0].data.read).toBe(true)
})
it('invitation retry preserves invitation identity; conflict is definitive', async () => {
  const store = useNotificationsStore()
  api.mutate
    .mockRejectedValueOnce(new Error('lost'))
    .mockResolvedValueOnce('workspace')
  await store.accept('invitation')
  await store.retry()
  expect(api.mutate.mock.calls[1]![0]).toEqual({
    action: 'accept',
    invitation: 'invitation',
  })
  api.mutate.mockRejectedValueOnce({ code: 'PT409' })
  expect(await store.mutate('preferences', {})).toBe(false)
  expect(store.uncertain).toBeNull()
})
it('successful ACK is not retried when subsequent feed load fails', async () => {
  const store = useNotificationsStore()
  api.mutate.mockResolvedValueOnce({})
  api.feed.mockRejectedValueOnce(new Error('network'))
  expect(await store.mutate('read_all', { through: '22' })).toBe(true)
  expect(store.uncertain).toBeNull()
  expect(store.notice).toBe('Đã cập nhật.')
  expect(store.error).toBeTruthy()
})
