import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '@/stores/workspaces'
import { safeRedirect } from '@/features/auth/navigation'
import { workspaceNameSchema, inviteSchema, workspaceError } from './model'
const api = vi.hoisted(() => ({
  list: vi.fn(),
  members: vi.fn(),
  invitations: vi.fn(),
}))
vi.mock('./api', () => ({ workspaceApi: api }))
const workspace = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'A',
  role: 'owner',
  created_at: '2026-09-29',
}
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  api.list.mockResolvedValue([workspace])
  api.members.mockResolvedValue([])
  api.invitations.mockResolvedValue([])
})
describe('workspace client state', () => {
  it('does not restore private data after signout while a request is pending', async () => {
    let resolve!: (value: unknown) => void
    api.list.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = useWorkspaceStore()
    const loading = store.load(workspace.id)
    store.clear()
    resolve([workspace])
    await loading
    expect(store.workspaces).toEqual([])
    expect(store.current).toBeNull()
  })
  it('clears previous workspace data after a denied refresh', async () => {
    const store = useWorkspaceStore()
    await store.load(workspace.id)
    expect(store.owner).toBe(true)
    api.list.mockResolvedValue([])
    await store.load(workspace.id)
    expect(store.current).toBeNull()
    expect(store.members).toEqual([])
    expect(store.error).toContain('quyền')
  })
  it('invalidates cached permissions when a write is denied', async () => {
    const store = useWorkspaceStore()
    await store.load(workspace.id)
    await store.mutate(async () => {
      throw { code: '42501', message: 'OWNER_REQUIRED' }
    })
    expect(store.owner).toBe(false)
    expect(store.current).toBeNull()
    expect(store.pending).toBe(false)
  })
  it('does not load invitation metadata for a viewer', async () => {
    api.list.mockResolvedValue([{ ...workspace, role: 'viewer' }])
    const store = useWorkspaceStore()
    await store.load(workspace.id)
    expect(api.invitations).not.toHaveBeenCalled()
    expect(store.owner).toBe(false)
  })
  it('blocks duplicate mutations and ignores completion after cleanup', async () => {
    let resolve!: (value: string) => void
    const action = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    const store = useWorkspaceStore()
    const first = store.mutate(action)
    expect(await store.mutate(action)).toBeNull()
    expect(action).toHaveBeenCalledOnce()
    store.clear()
    resolve('done')
    expect(await first).toBeNull()
  })
  it('validates names and roles and gives a migration-specific error', () => {
    expect(workspaceNameSchema.safeParse('  ').success).toBe(false)
    expect(
      inviteSchema.safeParse({ email: 'member@example.com', role: 'owner' })
        .success,
    ).toBe(false)
    expect(workspaceError({ code: 'PGRST202' })).toContain(
      'chưa được thiết lập',
    )
  })
  it('keeps workspace and invitation return URLs without allowing arbitrary URLs', () => {
    const token = 'a'.repeat(64)
    for (const target of [
      '/workspaces',
      `/workspaces/${workspace.id}/members`,
      `/invite/${token}`,
    ])
      expect(safeRedirect(target)).toBe(target)
    for (const target of [
      `//evil/invite/${token}`,
      `/invite/${token}?next=https://evil`,
      '/workspaces/../../admin',
      '/invite/not-a-token',
    ])
      expect(safeRedirect(target)).toBe('/board')
  })
})
