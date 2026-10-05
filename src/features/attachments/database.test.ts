import { beforeAll, afterAll, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  createHandler,
  type Backend,
} from '../../../supabase/functions/task-files/handler'
import { restoreQa } from '../../../scripts/restore-g5-qa'
let db: PGlite
const owner = randomUUID(),
  member = randomUUID(),
  outsider = randomUUID(),
  unverified = randomUUID()
async function rpc(
  user: string,
  name: string,
  args: unknown[] = [],
): Promise<any> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user])
    return (
      await tx.query<{ v: any }>(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) v`,
        args,
      )
    ).rows[0]?.v
  })
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
  for (const [id, email] of [
    [owner, 'owner@example.test'],
    [member, 'member@example.test'],
    [outsider, 'outsider@example.test'],
    [unverified, 'unverified@example.test'],
  ])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',
      [id, email, id === unverified ? null : new Date().toISOString()],
    )
  for (const f of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))
}, 30000)
afterAll(async () => {
  await db?.close()
})
async function setup(role = 'member') {
  const w = await rpc(owner, 'workspace_create', ['G3 SQL']),
    b = randomUUID()
  const token = await rpc(owner, 'workspace_invite', [
    w,
    'member@example.test',
    role,
  ])
  await rpc(member, 'workspace_invitation_accept', [token])
  await rpc(owner, 'board_create', [w, b, 'G3 Board'])
  return { w, b }
}
async function service(
  user: string,
  action: string,
  data: Record<string, unknown>,
) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return (
      await tx.query<{ v: any }>(
        'select public.attachment_service($1,$2,$3) v',
        [user, action, JSON.stringify(data)],
      )
    ).rows[0]!.v
  })
}
function file(task: string) {
  return {
    id: randomUUID(),
    task,
    name: 'notes.txt',
    size: 5,
    mime: 'text/plain',
    sha256: 'a'.repeat(64),
  }
}
async function confirm(user: string, data: ReturnType<typeof file>) {
  const a = await service(user, 'reserve', data)
  await db.query('insert into storage.objects values($1,$2,$3)', [
    'task-attachments',
    a.object_path,
    JSON.stringify({ size: data.size }),
  ])
  return service(user, 'confirm', { id: data.id })
}
it('server-only reserve, pending hidden, confirm checks object, retry is idempotent', async () => {
  const { b } = await setup()
  const t = await task(b),
    f = file(t)
  await expect(
    rpc(member, 'attachment_service', [member, 'reserve', f]),
  ).rejects.toThrow('permission denied')
  await expect(service(outsider, 'reserve', f)).rejects.toThrow('ACCESS_DENIED')
  await service(member, 'reserve', f)
  expect((await rpc(member, 'attachment_list', [t])).items).toHaveLength(0)
  await expect(service(member, 'confirm', { id: f.id })).rejects.toThrow(
    'UPLOAD_NOT_CONFIRMED',
  )
  await expect(
    service(member, 'reserve', { ...f, sha256: 'b'.repeat(64) }),
  ).rejects.toThrow('REUSED')
  await confirm(member, f)
  await service(member, 'confirm', { id: f.id })
  expect((await rpc(member, 'attachment_list', [t])).items).toHaveLength(1)
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.task_activity where task_id=$1 and changes ? 'attachment_added'",
        [t],
      )
    ).rows[0]?.n,
  ).toBe(1)
})
it('Viewer cannot upload; Member deletes own file; Owner moderation requires reason and stable receipt', async () => {
  const { w, b } = await setup('viewer'),
    t = await task(b),
    f = file(t)
  await expect(service(member, 'reserve', f)).rejects.toThrow('ACCESS_DENIED')
  await db.query(
    "update public.workspace_members set role='member' where workspace_id=$1 and user_id=$2",
    [w, member],
  )
  await confirm(member, f)
  const receipt = randomUUID()
  await expect(service(owner, 'delete', { id: f.id, receipt })).rejects.toThrow(
    'REASON_REQUIRED',
  )
  await service(owner, 'delete', {
    id: f.id,
    receipt,
    reason: 'Nội dung không phù hợp',
  })
  await expect(service(member, 'download', { id: f.id })).rejects.toThrow(
    'ACCESS_DENIED',
  )
  await service(owner, 'finish_delete', { id: f.id, receipt })
  await service(owner, 'delete', {
    id: f.id,
    receipt,
    reason: 'Nội dung không phù hợp',
  })
  expect((await rpc(owner, 'attachment_list', [t])).used_bytes).toBe(0)
})
it('reserves task and workspace quotas including archived data', async () => {
  const { w, b } = await setup(),
    t = await task(b)
  for (let i = 0; i < 20; i++) await service(member, 'reserve', file(t))
  await expect(service(member, 'reserve', file(t))).rejects.toThrow(
    'COUNT_LIMIT',
  )
  await db.query(
    'update workspace_internal.attachments set size=10485760 where workspace_id=$1',
    [w],
  )
  for (let j = 0; j < 2; j++) {
    const id = await task(b)
    for (let i = 0; i < 15; i++)
      await service(member, 'reserve', { ...file(id), size: 10485760 })
  }
  await expect(service(member, 'reserve', file(await task(b)))).rejects.toThrow(
    'QUOTA',
  )
}, 20000)
it('cleanup leases expired reservations, retries deletes, never selects ready objects', async () => {
  const { b } = await setup(),
    t = await task(b),
    ready = file(t),
    pending = file(t)
  await confirm(member, ready)
  await service(member, 'reserve', pending)
  await db.query(
    "update workspace_internal.attachments set expires_at=now()-interval '1 hour' where task_id=$1",
    [t],
  )
  await db.exec(
    "insert into workspace_internal.attachment_cleanup_config(endpoint,secret) values('https://example.invalid','test-secret')",
  )
  const gc = async (done: string | null = null) =>
    (
      await db.query<{ v: any }>('select public.attachment_gc($1,$2) v', [
        'test-secret',
        done,
      ])
    ).rows[0]!.v
  await expect(
    db.query("select public.attachment_gc('wrong')"),
  ).rejects.toThrow('GC_DENIED')
  const batch = await gc()
  expect(batch.map((a: any) => a.id)).toContain(pending.id)
  expect(batch.map((a: any) => a.id)).not.toContain(ready.id)
  expect(await gc()).toEqual([])
  await gc(pending.id)
  const a = (
    await db.query<{ object_path: string }>(
      'select object_path from workspace_internal.attachments where id=$1',
      [pending.id],
    )
  ).rows[0]!
  await db.query('insert into storage.objects values($1,$2,$3)', [
    'task-attachments',
    a.object_path,
    '{"size":5}',
  ])
  expect((await gc()).map((a: any) => a.id)).toContain(pending.id)
})
it('export is Owner-only, contains linked metadata/counts and no identity emails; access revoked immediately', async () => {
  const { w, b } = await setup(),
    t = await task(b),
    f = file(t)
  await confirm(member, f)
  await expect(rpc(member, 'workspace_export', [w])).rejects.toThrow(
    'OWNER_REQUIRED',
  )
  const output = await rpc(owner, 'workspace_export', [w])
  expect(output.schema_version).toBe(1)
  expect(output.manifest.counts.tasks).toBe(1)
  expect(output.attachments[0].task_id).toBe(t)
  expect(output.manifest.files).toBe('metadata_only')
  expect(JSON.stringify(output)).not.toContain('@example.test')
  await db.query(
    'delete from public.workspace_members where workspace_id=$1 and user_id=$2',
    [w, member],
  )
  await expect(service(member, 'download', { id: f.id })).rejects.toThrow(
    'ACCESS_DENIED',
  )
  await db.query('update public.workspaces set archived_at=now() where id=$1', [
    w,
  ])
  expect(
    (await rpc(owner, 'workspace_export', [w])).workspace.archived_at,
  ).toBeTruthy()
  await expect(service(owner, 'reserve', file(t))).rejects.toThrow(
    'ACCESS_DENIED',
  )
})
it('Edge authenticates before upload, retries duplicate storage safely, exports and restores linked database + actual file bytes', async () => {
  const { w, b } = await setup(),
    t = await task(b),
    f = file(t),
    objects = new Map<string, Uint8Array>()
  const backend: Backend = {
    auth: {
      async getUser(token) {
        return {
          data: {
            user:
              token === member
                ? { id: member, email_confirmed_at: '2026-01-01' }
                : null,
          },
          error: null,
        }
      },
    },
    async rpc(name, args) {
      try {
        const value = await db.transaction(async (tx) => {
          await tx.exec('set local role service_role')
          const keys = Object.keys(args)
          return (
            await tx.query<{ v: any }>(
              `select public.${name}(${keys.map((k, i) => k + '=> $' + (i + 1)).join(',')}) v`,
              keys.map((k) =>
                typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k],
              ),
            )
          ).rows[0]!.v
        })
        return { data: value, error: null }
      } catch (error) {
        return { data: null, error }
      }
    },
    storage: {
      from: () => ({
        async upload(path, body) {
          if (objects.has(path))
            return { data: null, error: { statusCode: '409' } }
          objects.set(path, body)
          await db.query('insert into storage.objects values($1,$2,$3)', [
            'task-attachments',
            path,
            JSON.stringify({ size: body.length }),
          ])
          return { data: {}, error: null }
        },
        async remove(paths) {
          for (const path of paths) {
            objects.delete(path)
            await db.query('delete from storage.objects where name=$1', [path])
          }
          return { data: {}, error: null }
        },
        async createSignedUrl(path, ttl, options) {
          return {
            data: {
              signedUrl: `https://example.test/${path}?ttl=${ttl}&download=${options.download}`,
            },
            error: null,
          }
        },
      }),
    },
  }
  const handler = createHandler(backend, ['http://localhost:5173'])
  const send = (token: string, filename = 'notes.txt') =>
    handler(
      new Request('https://example.test', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'x-action': 'upload',
          'x-task-id': t,
          'x-attachment-id': f.id,
          'x-file-name': filename,
        },
        body: 'hello',
      }),
    )
  expect((await send('bad')).status).toBe(401)
  expect((await send(member, 'fake.png')).status).toBe(415)
  expect((await send(member)).status).toBe(200)
  expect((await send(member)).status).toBe(200)
  expect(objects.size).toBe(1)
  const snapshot = await rpc(owner, 'workspace_export', [w]),
    bytes = objects.values().next().value!
  const report = await restoreQa(snapshot, new Map([[f.id, bytes]]))
  expect(report.completed).toBe(true)
  expect(report.files).toHaveLength(1)
  expect(report.roles.map((r) => r.role).sort()).toEqual(['member', 'owner'])
  await expect(
    restoreQa(snapshot, new Map([[f.id, new Uint8Array([0])]])),
  ).rejects.toThrow('corrupt')
}, 30000)
async function task(b: string, extra: Record<string, unknown> = {}) {
  const s = await rpc(owner, 'board_snapshot', [b]),
    id = randomUUID()
  await rpc(owner, 'board_mutate', [
    b,
    s.board.version,
    randomUUID(),
    'save_task',
    {
      id,
      title: 'G3 Task',
      description: 'Needle 100%',
      status: 'todo',
      priority: 'high',
      assignee_id: member,
      due_date: '',
      ...extra,
    },
  ])
  return id
}
