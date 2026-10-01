import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
export type ConnectionState = 'connecting' | 'live' | 'fallback' | 'offline'
export type ChangeFilter = {
  table: string
  filter: string
  event: 'INSERT' | 'UPDATE'
}
export const collabConfig = {
  debounceMs: 180,
  retryMs: 1500,
  pollMs: 30000,
} as const

// Events invalidate snapshots; RPCs remain the authority for data and permissions.
export function createSync(options: {
  client: SupabaseClient | null
  filters: ChangeFilter[]
  refresh: () => Promise<boolean>
  available: () => boolean
  state: (state: ConnectionState) => void
}) {
  let stopped = false,
    dirty = false,
    running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let channel: RealtimeChannel | undefined
  let subscribed = false
  function schedule(delay: number = collabConfig.debounceMs) {
    if (stopped || timer || running) return
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, delay)
  }
  async function flush() {
    if (stopped || running || !dirty) return
    if (!options.available()) return // visibility/online/focus or fallback timer wakes us
    dirty = false
    running = true
    try {
      if (!(await options.refresh())) dirty = true
    } catch {
      dirty = true
    } finally {
      running = false
      if (!stopped && dirty) schedule(collabConfig.retryMs)
    }
  }
  function invalidate() {
    if (!stopped) {
      dirty = true
      schedule()
    }
  }
  function connection(online: boolean) {
    if (stopped) return
    options.state(!online ? 'offline' : subscribed ? 'live' : 'fallback')
    if (online) invalidate()
  }
  options.state(options.client ? 'connecting' : 'fallback')
  if (options.client) {
    channel = options.client.channel('collab:' + crypto.randomUUID())
    for (const filter of options.filters)
      channel.on(
        'postgres_changes',
        { schema: 'public', ...filter },
        invalidate,
      )
    channel.subscribe((status) => {
      if (stopped) return
      subscribed = status === 'SUBSCRIBED'
      options.state(subscribed ? 'live' : 'fallback')
      if (subscribed) invalidate() // fetch changes missed during a disconnect
    })
  }
  const polling = setInterval(invalidate, collabConfig.pollMs)
  invalidate()
  return {
    invalidate,
    connection,
    stop() {
      stopped = true
      clearTimeout(timer)
      clearInterval(polling)
      if (channel) void options.client?.removeChannel(channel).catch(() => {})
    },
  }
}
