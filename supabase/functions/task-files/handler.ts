import { FileError, readBounded, validateFile } from './validation.ts'
type Result = { data: any; error: any }
export type Backend = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email_confirmed_at?: string | null } | null }
      error: any
    }>
  }
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result>
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: Record<string, unknown>,
      ): Promise<Result>
      remove(paths: string[]): Promise<Result>
      createSignedUrl(
        path: string,
        ttl: number,
        options: { download: string },
      ): Promise<Result>
    }
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function createHandler(admin: Backend, allowedOrigins: string[]) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin'),
      headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Vary: 'Origin',
      }
    if (origin && allowedOrigins.includes(origin))
      headers['Access-Control-Allow-Origin'] = origin
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers })
    if (origin && !allowedOrigins.includes(origin))
      return reply({ code: 'ORIGIN_DENIED' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers':
            'authorization, apikey, content-type, x-client-info, x-action, x-task-id, x-attachment-id, x-file-name',
        },
      })
    if (request.method !== 'POST')
      return reply({ code: 'METHOD_NOT_ALLOWED' }, 405)
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const { data, error } = await admin.rpc(name, args)
      if (error) throw error
      return data
    }
    const storage = admin.storage.from('task-attachments')
    try {
      const action = request.headers.get('x-action')
      // Cron has no user JWT. Its random server secret is checked inside the private SQL API.
      if (!action) {
        const body = JSON.parse(
          new TextDecoder().decode(await readBounded(request)),
        )
        if (
          body.action !== 'gc' ||
          typeof body.secret !== 'string' ||
          body.secret.length !== 64
        )
          throw new FileError('UNAUTHORIZED', 401)
        const batch = await rpc('attachment_gc', { p_secret: body.secret })
        let removed = 0
        for (const item of batch) {
          const { error } = await storage.remove([item.object_path])
          if (error) continue
          await rpc('attachment_gc', { p_secret: body.secret, p_done: item.id })
          removed++
        }
        return reply({ claimed: batch.length, removed })
      }
      const token = request.headers
        .get('authorization')
        ?.replace(/^Bearer\s+/i, '')
      if (!token) throw new FileError('UNAUTHORIZED', 401)
      const auth = await admin.auth.getUser(token),
        user = auth.data.user
      if (auth.error || !user?.email_confirmed_at)
        throw new FileError('UNAUTHORIZED', 401)
      const call = (operation: string, data: Record<string, unknown>) =>
        rpc('attachment_service', {
          p_user: user.id,
          p_action: operation,
          p_data: data,
        })
      if (action === 'upload') {
        const id = request.headers.get('x-attachment-id') ?? '',
          task = request.headers.get('x-task-id') ?? ''
        if (!uuid.test(id) || !uuid.test(task))
          throw new FileError('INVALID_ATTACHMENT')
        let name: string
        try {
          name = decodeURIComponent(request.headers.get('x-file-name') ?? '')
        } catch {
          throw new FileError('INVALID_FILENAME')
        }
        const bytes = await readBounded(request),
          mime = validateFile(name, bytes)
        const sha256 = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              bytes as Uint8Array<ArrayBuffer>,
            ),
          ),
          (b) => b.toString(16).padStart(2, '0'),
        ).join('')
        const reservation = await call('reserve', {
          id,
          task,
          name,
          size: bytes.length,
          mime,
          sha256,
        })
        if (reservation.state !== 'ready') {
          const upload = await storage.upload(reservation.object_path, bytes, {
            contentType: mime,
            upsert: false,
            cacheControl: '0',
          })
          if (
            upload.error &&
            String(upload.error.statusCode) !== '409' &&
            upload.error.error !== 'Duplicate'
          )
            throw new FileError('UPLOAD_RETRY_REQUIRED', 503)
          await call('confirm', { id })
        }
        return reply({ id })
      }
      const body = JSON.parse(
        new TextDecoder().decode(await readBounded(request)),
      )
      if (!uuid.test(body.id ?? '')) throw new FileError('INVALID_ATTACHMENT')
      if (action === 'download') {
        const file = await call('download', { id: body.id })
        const result = await storage.createSignedUrl(file.object_path, 60, {
          download: file.name,
        })
        if (result.error) throw new FileError('DOWNLOAD_UNAVAILABLE', 503)
        return reply({ url: result.data.signedUrl, expires_in: 60 })
      }
      if (action === 'delete') {
        if (!uuid.test(body.receipt ?? ''))
          throw new FileError('INVALID_ATTACHMENT')
        const file = await call('delete', {
          id: body.id,
          receipt: body.receipt,
          reason: body.reason ?? '',
        })
        if (file.state !== 'deleted') {
          const result = await storage.remove([file.object_path])
          if (result.error) throw new FileError('DELETE_RETRY_REQUIRED', 503)
          await call('finish_delete', { id: body.id, receipt: body.receipt })
        }
        return reply({ id: body.id })
      }
      throw new FileError('INVALID_ACTION')
    } catch (error) {
      if (error instanceof FileError)
        return reply({ code: error.code }, error.status)
      const e = error as { code?: string; message?: string }
      // Do not return provider messages, SQL detail, credentials or object paths.
      if (e.code === '42501') return reply({ code: 'ACCESS_DENIED' }, 403)
      if (e.code === 'PT409') return reply({ code: 'RECEIPT_CONFLICT' }, 409)
      if (e.code === '22023')
        return reply(
          {
            code: [
              'ATTACHMENT_COUNT_LIMIT',
              'ATTACHMENT_QUOTA',
              'DELETE_REASON_REQUIRED',
              'ATTACHMENT_EXPIRED',
            ].includes(e.message ?? '')
              ? e.message
              : 'INVALID_ATTACHMENT',
          },
          400,
        )
      if (error instanceof SyntaxError)
        return reply({ code: 'INVALID_REQUEST' }, 400)
      return reply({ code: 'RETRY_REQUIRED' }, 503)
    }
  }
}
