import { afterEach, describe, expect, it, vi } from 'vitest'
import { withDeadline } from './request'
import { syncStatus, type SyncInput } from './status'
afterEach(() => vi.useRealTimers())
describe('sync deadlines', () => {
  it('releases a stuck request, aborts transport and ignores late completion', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    let complete!: (v: string) => void
    const request = withDeadline((s) => {
      signal = s
      return new Promise<string>((resolve) => {
        complete = resolve
      })
    }, 100)
    const result = request.catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBe('SYNC_TIMEOUT')
    expect(signal.aborted).toBe(true)
    complete('late saved response')
    expect(await result).toBe('SYNC_TIMEOUT')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cleans up timers on success and preserves definitive server errors', async () => {
    vi.useFakeTimers()
    expect(await withDeadline(async () => 'ok')).toBe('ok')
    const error = { code: 'PT409', message: 'BOARD_CONFLICT' }
    await expect(
      withDeadline(async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(vi.getTimerCount()).toBe(0)
  })
})
describe('truthful sync status', () => {
  const confirmed: SyncInput = {
    online: true,
    pending: false,
    uncertain: false,
    loading: false,
    refreshing: false,
    error: '',
    syncError: '',
    lastSyncedAt: '2026-10-01T01:00:00Z',
  }
  it.each([
    [{ pending: true, uncertain: true }, 'saving'],
    [{ uncertain: true, online: false }, 'uncertain'],
    [{ online: false }, 'offline'],
    [{ error: 'conflict' }, 'error'],
    [{ syncError: 'network failed' }, 'stale'],
    [{ loading: true }, 'loading'],
    [{ refreshing: true }, 'refreshing'],
    [{ lastSyncedAt: '' }, 'idle'],
    [{}, 'synced'],
  ])(
    'does not show success over an unresolved condition %j',
    (overrides, kind) => {
      expect(syncStatus({ ...confirmed, ...overrides }).kind).toBe(kind)
    },
  )
})
