import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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
  await db.exec(`create role anon;create role authenticated;create schema auth;
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
  const w = await rpc(owner, 'workspace_create', ['G4 SQL']),
    b = randomUUID()
  const token = await rpc(owner, 'workspace_invite', [
    w,
    'member@example.test',
    role,
  ])
  await rpc(member, 'workspace_invitation_accept', [token])
  await rpc(owner, 'board_create', [w, b, 'G4 Board'])
  return { w, b }
}
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
const query = (u: string, f = {}, page = 1, limit = 20) =>
  rpc(u, 'my_tasks_query', [f, page, limit])

beforeEach(async () => {
  await db.exec(
    'truncate workspace_internal.notifications,workspace_internal.notification_preferences,workspace_internal.notification_receipts,workspace_internal.task_watches,public.notification_signals',
  )
})
const feed = (
  u: string,
  before: string | null = null,
  unread = false,
  limit = 20,
) => rpc(u, 'notification_feed', [before, unread, limit])
const mutation = (
  u: string,
  action: string,
  data: unknown,
  id = randomUUID(),
) => rpc(u, 'notification_mutate', [id, action, data])
const comment = (u: string, b: string, t: string, id = randomUUID()) =>
  rpc(u, 'task_comment_add', [b, t, id, 'A new comment'])
it('assignment and comment events are transactional, private and deduplicated', async () => {
  const { w, b } = await setup(),
    t = await task(b)
  let f = await feed(member)
  expect(f.items).toHaveLength(1)
  expect(f.items[0].kind).toBe('assignment')
  expect((await feed(owner)).items).toEqual([])
  const id = randomUUID()
  await comment(owner, b, t, id)
  await comment(owner, b, t, id)
  f = await feed(member)
  expect(f.items.filter((n: any) => n.kind === 'comment')).toHaveLength(1)
  await comment(member, b, t)
  expect((await feed(member)).items).toHaveLength(2)
  expect((await feed(outsider)).items).toEqual([])
  await expect(feed(unverified)).rejects.toThrow('VERIFIED_ACCOUNT_REQUIRED')
  await expect(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query('select * from workspace_internal.notifications')
    }),
  ).rejects.toThrow()
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      outsider,
    ])
    expect(
      (await tx.query('select * from public.notification_signals')).rows,
    ).toEqual([])
  })
  const s = await rpc(owner, 'board_snapshot', [b])
  await expect(
    rpc(owner, 'board_mutate', [
      b,
      s.board.version - 1,
      randomUUID(),
      'save_task',
      {
        id: t,
        title: 'Rollback',
        status: 'todo',
        priority: 'low',
        assignee_id: owner,
        due_date: '',
        description: '',
      },
    ]),
  ).rejects.toThrow()
  expect((await feed(owner)).items).toHaveLength(0)
  const countBefore = (await feed(member)).items.length
  await expect(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ])
      await tx.query('select public.task_comment_add($1,$2,$3,$4)', [
        b,
        t,
        randomUUID(),
        'Will roll back',
      ])
      throw Error('Rollback after notification trigger')
    }),
  ).rejects.toThrow('Rollback after notification trigger')
  expect((await feed(member)).items).toHaveLength(countBefore)
})
it('assignee follows by default, explicit opt-out, Viewer watch and preferences work', async () => {
  const { b } = await setup('viewer'),
    t = await task(b)
  expect(await rpc(member, 'task_watch_get', [t])).toMatchObject({
    enabled: true,
    automatic: true,
    version: 0,
  })
  await mutation(member, 'watch', { task: t, version: 0, enabled: false })
  await comment(owner, b, t)
  expect((await feed(member)).items).toHaveLength(1)
  await mutation(member, 'watch', { task: t, version: 1, enabled: true })
  await comment(owner, b, t)
  expect((await feed(member)).items).toHaveLength(2)
  await mutation(member, 'preferences', {
    assignments: true,
    comments: false,
    invitations: true,
    version: 0,
  })
  await comment(owner, b, t)
  expect((await feed(member)).items).toHaveLength(2)
  await expect(
    mutation(outsider, 'watch', { task: t, version: 0, enabled: true }),
  ).rejects.toThrow('TASK_ACCESS_DENIED')
  await expect(
    mutation(member, 'watch', { task: t, version: 1, enabled: false }),
  ).rejects.toThrow('NOTIFICATION_CONFLICT')
})
it('read updates conflict, retry uses receipt and read-all excludes future arrivals', async () => {
  const { b } = await setup(),
    t = await task(b),
    f = await feed(member),
    n = f.items[0],
    receipt = randomUUID()
  const data = { id: n.id, version: n.version, read: true }
  await mutation(member, 'read', data, receipt)
  await mutation(member, 'read', data, receipt)
  expect((await feed(member)).items[0]).toMatchObject({
    read: true,
    version: 2,
  })
  await expect(
    mutation(member, 'read', { ...data, read: false }),
  ).rejects.toThrow('NOTIFICATION_CONFLICT')
  await expect(mutation(outsider, 'read', data)).rejects.toThrow(
    'NOTIFICATION_ACCESS_DENIED',
  )
  await expect(
    mutation(member, 'read', { ...data, read: false }, receipt),
  ).rejects.toThrow('MUTATION_REUSED')
  await comment(owner, b, t)
  await mutation(member, 'read_all', { through: f.high_water })
  expect((await feed(member, null, true)).items).toHaveLength(1)
})
it('loss of membership, archive, and deleted comments hide content on new reads', async () => {
  const { w, b } = await setup(),
    t = await task(b),
    id = randomUUID()
  await comment(owner, b, t, id)
  await db.query(
    'update public.task_comments set deleted_at=now(),body=null where id=$1',
    [id],
  )
  expect((await feed(member)).items).toHaveLength(1)
  await db.query('update public.boards set archived_at=now() where id=$1', [b])
  expect((await feed(member)).items).toHaveLength(0)
  await db.query('update public.boards set archived_at=null where id=$1', [b])
  await mutation(member, 'watch', { task: t, version: 0, enabled: true })
  await rpc(owner, 'workspace_member_remove', [w, member])
  expect((await feed(member)).items).toHaveLength(0)
  expect(
    (
      await db.query(
        'select * from workspace_internal.task_watches where task_id=$1',
        [t],
      )
    ).rows,
  ).toHaveLength(0)
})
it('invitation requires verified exact email, supports idempotent acceptance and denies expired/revoked links', async () => {
  const w = await rpc(owner, 'workspace_create', ['Invite G4'])
  await rpc(owner, 'workspace_invite', [w, 'member@example.test', 'viewer'])
  const n = (await feed(member)).items[0]
  expect(n.kind).toBe('invitation')
  expect((await feed(outsider)).items).toHaveLength(0)
  await expect(
    rpc(outsider, 'notification_invitation_accept', [n.invitation_id]),
  ).rejects.toThrow('INVITATION_ACCESS_DENIED')
  expect(
    await rpc(member, 'notification_invitation_accept', [n.invitation_id]),
  ).toBe(w)
  expect(
    await rpc(member, 'notification_invitation_accept', [n.invitation_id]),
  ).toBe(w)
  expect((await feed(member)).items).toHaveLength(0)
  expect(await rpc(member, 'workspace_role', [w])).toBe('viewer')
  const other = await rpc(owner, 'workspace_create', ['Expired G4'])
  await rpc(owner, 'workspace_invite', [other, 'member@example.test', 'member'])
  const expired = (await feed(member)).items[0]
  await db.query(
    "update public.workspace_invitations set expires_at=now()-interval '1 second' where id=$1",
    [expired.invitation_id],
  )
  expect((await feed(member)).items).toHaveLength(0)
  await expect(
    rpc(member, 'notification_invitation_accept', [expired.invitation_id]),
  ).rejects.toThrow('INVITATION_INVALID')
  await rpc(owner, 'workspace_invite', [other, 'member@example.test', 'member'])
  const revoked = (await feed(member)).items[0]
  await rpc(owner, 'workspace_invitation_revoke', [
    other,
    revoked.invitation_id,
  ])
  expect((await feed(member)).items).toHaveLength(0)
  await expect(
    rpc(member, 'notification_invitation_accept', [revoked.invitation_id]),
  ).rejects.toThrow('INVITATION_INVALID')
})
it('keyset pagination has no repeats with new arrivals and rejects invalid writes', async () => {
  const { b } = await setup(),
    t = await task(b)
  for (let i = 0; i < 4; i++) await comment(owner, b, t)
  const first = await feed(member, null, false, 2)
  await comment(owner, b, t)
  const second = await feed(member, first.next, false, 2)
  expect(
    new Set([...first.items, ...second.items].map((n: any) => n.id)).size,
  ).toBe(4)
  await expect(feed(member, null, false, 51)).rejects.toThrow('INVALID_INPUT')
  await expect(
    mutation(member, 'preferences', { comments: true }),
  ).rejects.toThrow('INVALID_INPUT')
  await expect(mutation(member, 'read_all', {})).rejects.toThrow(
    'INVALID_INPUT',
  )
})
