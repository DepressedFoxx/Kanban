// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceSettingsStore } from '@/stores/workspaceSettings'
const api = vi.hoisted(() => ({
  get: vi.fn(),
  activity: vi.fn(),
  mutate: vi.fn(),
}))
vi.mock('./settings', () => ({ settingsApi: api }))
const data = {
  id: 'w',
  name: 'Name',
  role: 'owner',
  version: 1,
  description: '',
  timezone: 'UTC',
  archived_at: null,
}
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  api.get.mockResolvedValue(data)
  api.activity.mockResolvedValue([])
})
it('uncertain write keeps detached payload and repeats exact receipt', async () => {
  const store = useWorkspaceSettingsStore()
  await store.load('w')
  api.mutate.mockRejectedValueOnce(new Error('network'))
  const draft = { name: 'Original' }
  await store.mutate('update', draft, 1)
  draft.name = 'Changed'
  expect(store.uncertain?.data.name).toBe('Original')
  api.mutate.mockResolvedValue({ ok: true })
  await store.retry()
  expect(api.mutate.mock.calls[1]![0]).toEqual(api.mutate.mock.calls[0]![0])
  expect(store.uncertain).toBeNull()
})
it('clear prevents stale load from restoring private settings', async () => {
  let finish!: (value: unknown) => void
  api.get.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const store = useWorkspaceSettingsStore(),
    loading = store.load('w')
  store.clear()
  finish(data)
  await loading
  expect(store.snapshot).toBeNull()
  expect(store.activity).toEqual([])
})
it('definitive denied write clears permissions and does not create retry', async () => {
  const store = useWorkspaceSettingsStore()
  await store.load('w')
  api.mutate.mockRejectedValue({ code: '42501' })
  await store.mutate('archive', {}, 1)
  expect(store.snapshot).toBeNull()
  expect(store.uncertain).toBeNull()
})
it('confirmed leave clears data before navigation', async () => {
  const store = useWorkspaceSettingsStore()
  await store.load('w')
  api.mutate.mockResolvedValue({ ok: true })
  expect(await store.mutate('leave', {}, 1)).toBe(true)
  expect(store.snapshot).toBeNull()
})
