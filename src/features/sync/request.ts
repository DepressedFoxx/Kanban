export const syncConfig = { requestTimeoutMs: 15000 } as const

// Aborting a request does not prove that its server transaction was rolled back.
// A timed-out write must retain its original idempotency key for reconciliation.
export async function withDeadline<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs: number = syncConfig.requestTimeoutMs,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('SYNC_TIMEOUT'))
      controller.abort()
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      Promise.resolve().then(() => run(controller.signal)),
      deadline,
    ])
  } finally {
    clearTimeout(timer)
  }
}
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
export function isAccessDenied(cause: unknown) {
  return ['42501', 'PGRST301', 'PGRST303'].includes(
    (cause as { code?: string })?.code ?? '',
  )
}
export function isDefinitiveFailure(cause: unknown) {
  const code = (cause as { code?: string })?.code
  return Boolean(code && /^(22|23|42|40|PT409$|PGRST)/.test(code))
}
