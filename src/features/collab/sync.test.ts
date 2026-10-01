import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSync } from './sync'
import type { SupabaseClient } from '@supabase/supabase-js'
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function setup() {
  let event!: () => void
  let status!: (value: string) => void
  const channel = {
    on: vi.fn((_type, _filter, callback) => {
      event = callback
      return channel
    }),
    subscribe: vi.fn((callback) => {
      status = callback
      return channel
    }),
  }
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  }
  const refresh = vi.fn(async () => true),
    state = vi.fn(),
    available = vi.fn(() => true)
  const sync = createSync({
    client: client as unknown as SupabaseClient,
    filters: [{ table: 'boards', filter: 'id=eq.test', event: 'UPDATE' }],
    refresh,
    state,
    available,
  })
  return {
    sync,
    refresh,
    state,
    available,
    client,
    event: () => event(),
    status: (s: string) => status(s),
  }
}
describe('collaboration invalidation lifecycle', () => {
  it('coalesces bursts and refreshes after subscribing or reconnecting', async () => {
    const t = setup()
    t.status('SUBSCRIBED')
    t.event()
    t.event()
    await vi.advanceTimersByTimeAsync(180)
    expect(t.refresh).toHaveBeenCalledTimes(1)
    expect(t.state).toHaveBeenLastCalledWith('live')
    t.status('CHANNEL_ERROR')
    expect(t.state).toHaveBeenLastCalledWith('fallback')
    t.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(180)
    expect(t.refresh).toHaveBeenCalledTimes(2)
    t.sync.stop()
  })
  it('queues an event arriving during an in-flight snapshot', async () => {
    const t = setup()
    let finish!: (v: boolean) => void
    t.refresh.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await vi.advanceTimersByTimeAsync(180)
    t.event()
    t.event()
    finish(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(t.refresh).toHaveBeenCalledTimes(2)
    t.sync.stop()
  })
  it('retries deferred writes/dragging and keeps periodic permission checks', async () => {
    const t = setup()
    t.refresh.mockResolvedValueOnce(false)
    await vi.advanceTimersByTimeAsync(1680)
    expect(t.refresh).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30000)
    expect(t.refresh).toHaveBeenCalledTimes(3)
    t.sync.stop()
  })
  it('suspends reads while hidden/offline and wakes with a fresh snapshot', async () => {
    const t = setup()
    t.available.mockReturnValue(false)
    t.sync.connection(false)
    await vi.advanceTimersByTimeAsync(60000)
    expect(t.refresh).not.toHaveBeenCalled()
    t.available.mockReturnValue(true)
    t.sync.connection(true)
    await vi.advanceTimersByTimeAsync(180)
    expect(t.refresh).toHaveBeenCalledTimes(1)
    t.sync.stop()
  })
  it('ignores late callbacks and tears down timers and channel on leave', async () => {
    const t = setup()
    t.sync.stop()
    t.event()
    t.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(60000)
    expect(t.refresh).not.toHaveBeenCalled()
    expect(t.client.removeChannel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
