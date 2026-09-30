import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { safeRedirect } from '@/features/auth/navigation'
const api = vi.hoisted(() => ({ snapshot: vi.fn(), mutate: vi.fn() }))
vi.mock('./api', () => ({ boardsApi: api }))
const id = '20000000-0000-4000-8000-000000000001'
const value = (version = 1, role = 'owner') => ({
  board: { id, workspace_id: id, name: 'Board', version, archived_at: null },
  role,
  tasks: [],
  members: [],
})
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  api.snapshot.mockResolvedValue(value())
})
describe('online board state', () => {
  it('ignores late loads after logout', async () => {
    let finish!: (value: unknown) => void
    api.snapshot.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const store = useOnlineBoardStore(),
      request = store.load(id)
    store.clear()
    finish(value())
    await request
    expect(store.snapshot).toBeNull()
    expect(store.loading).toBe(false)
  })
  it('guards duplicate writes and ignores late writes after logout', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    let finish!: (value: unknown) => void
    api.mutate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const pending = store.mutate('rename', { name: 'New' })
    expect(await store.mutate('rename', { name: 'Duplicate' })).toBe(false)
    store.clear()
    finish(value(2))
    await pending
    expect(store.snapshot).toBeNull()
    expect(api.mutate).toHaveBeenCalledTimes(1)
  })
  it('keeps uncertain writes blocked and retries the exact mutation receipt', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    api.mutate
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(value(2))
    expect(await store.mutate('save_task', { id })).toBe(false)
    expect(store.uncertain).not.toBeNull()
    expect(store.writable).toBe(false)
    expect(await store.mutate('rename', { name: 'Other' })).toBe(false)
    const args = api.mutate.mock.calls[0]
    expect(await store.retry()).toBe(true)
    expect(api.mutate.mock.calls[1]).toEqual(args)
    expect(store.snapshot?.board.version).toBe(2)
    expect(store.uncertain).toBeNull()
  })
  it('reloads the latest snapshot on conflict without silently resubmitting', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    api.snapshot.mockResolvedValue(value(3))
    api.mutate.mockRejectedValue({ code: '40001', message: 'BOARD_CONFLICT' })
    expect(await store.mutate('save_task', { id }, 1)).toBe(false)
    expect(store.snapshot?.board.version).toBe(3)
    expect(store.error).toContain('bản nháp')
    expect(api.mutate).toHaveBeenCalledTimes(1)
  })
  it('clears private state when server denies access and disables viewers', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    api.mutate.mockRejectedValue({
      code: '42501',
      message: 'WORKSPACE_ACCESS_DENIED',
    })
    await store.mutate('rename', { name: 'New' })
    expect(store.snapshot).toBeNull()
    api.snapshot.mockResolvedValue(value(2, 'viewer'))
    await store.load(id)
    expect(store.writable).toBe(false)
  })
  it('refreshes silently without changing writable state or identical snapshot identity', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    const previous = store.snapshot
    let finish!: (value: unknown) => void
    api.snapshot.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const request = store.load(id, { background: true })
    expect(store.loading).toBe(false)
    expect(store.writable).toBe(true)
    expect(store.refreshing).toBe(true)
    expect(store.snapshot).toBe(previous)
    expect(await store.load(id, { background: true })).toBe(false)
    finish(value())
    await request
    expect(store.snapshot).toBe(previous)
    expect(store.refreshing).toBe(false)
  })
  it('does not let a late background read overwrite a successful mutation', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    let finish!: (value: unknown) => void
    api.snapshot.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const request = store.load(id, { background: true })
    api.mutate.mockResolvedValue(value(2))
    expect(await store.mutate('rename', { name: 'New' })).toBe(true)
    finish(value())
    await request
    expect(store.snapshot?.board.version).toBe(2)
    expect(store.refreshing).toBe(false)
  })
  it('retains data on background network errors but clears it on revoked access', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    const previous = store.snapshot
    api.snapshot.mockRejectedValueOnce(new Error('Network'))
    await store.load(id, { background: true })
    expect(store.snapshot).toBe(previous)
    expect(store.error).toBe('')
    expect(store.syncError).not.toBe('')
    api.snapshot.mockRejectedValueOnce({ code: '42501' })
    await store.load(id, { background: true })
    expect(store.snapshot).toBeNull()
    expect(store.writable).toBe(false)
  })
  it('still applies role changes even when board version is unchanged', async () => {
    const store = useOnlineBoardStore()
    await store.load(id)
    api.snapshot.mockResolvedValue(value(1, 'viewer'))
    await store.load(id, { background: true })
    expect(store.snapshot?.role).toBe('viewer')
    expect(store.writable).toBe(false)
  })
  it('allows exact board return paths but rejects added queries and external URLs', () => {
    for (const path of [`/boards/${id}`, `/workspaces/${id}/boards`])
      expect(safeRedirect(path)).toBe(path)
    expect(safeRedirect(`/boards/${id}?redirect=//evil`)).toBe('/board')
  })
})
