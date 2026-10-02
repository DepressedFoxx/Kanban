import { beforeAll, afterAll, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
let db: PGlite
const owner = randomUUID(),
  member = randomUUID(),
  viewer = randomUUID()
async function rpc(user: string, name: string, args: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user])
    const result = await tx.query<{ v: any }>(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) v`,
      args,
    )
    return result.rows[0]?.v
  })
}
async function setup() {
  const w = await rpc(owner, 'workspace_create', ['G1 SQL'])
  for (const [u, email, role] of [
    [member, 'member@example.test', 'member'],
    [viewer, 'viewer@example.test', 'viewer'],
  ]) {
    const token = await rpc(owner, 'workspace_invite', [w, email, role])
    await rpc(u!, 'workspace_invitation_accept', [token])
  }
  return w as string
}
async function mutate(
  w: string,
  action: string,
  data = {},
  user = owner,
  version?: number,
  id = randomUUID(),
) {
  const s = await rpc(user, 'workspace_settings_get', [w])
  return rpc(user, 'workspace_mutate', [
    w,
    version ?? s.version,
    id,
    action,
    data,
  ])
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`)
  for (const [id, email] of [
    [owner, 'owner@example.test'],
    [member, 'member@example.test'],
    [viewer, 'viewer@example.test'],
  ])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
      [id, email],
    )
  for (const f of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'))
}, 30000)
afterAll(async () => {
  await db?.close()
})
it('settings validate role/timezone, version and receipt', async () => {
  const w = await setup(),
    s = await rpc(owner, 'workspace_settings_get', [w]),
    id = randomUUID()
  const data = { name: 'Updated', description: 'G1', timezone: 'UTC' }
  await expect(mutate(w, 'update', data, member)).rejects.toThrow(
    'OWNER_REQUIRED',
  )
  await expect(
    mutate(w, 'update', { ...data, timezone: 'Invalid/Zone' }),
  ).rejects.toThrow('INVALID_INPUT')
  await mutate(w, 'update', data, owner, s.version, id)
  await rpc(owner, 'workspace_mutate', [w, s.version, id, 'update', data])
  await expect(
    rpc(owner, 'workspace_mutate', [
      w,
      s.version,
      id,
      'update',
      { ...data, name: 'Other' },
    ]),
  ).rejects.toThrow('MUTATION_REUSED')
  await expect(mutate(w, 'update', data, owner, s.version)).rejects.toThrow(
    'WORKSPACE_CONFLICT',
  )
  expect((await rpc(owner, 'workspace_settings_get', [w])).version).toBe(
    s.version + 1,
  )
})
it('transfers to viewer atomically and old owner retries after losing ownership', async () => {
  const w = await setup(),
    s = await rpc(owner, 'workspace_settings_get', [w]),
    id = randomUUID(),
    data = { user_id: viewer }
  await mutate(w, 'transfer', data, owner, s.version, id)
  expect((await rpc(viewer, 'workspace_settings_get', [w])).owner_id).toBe(
    viewer,
  )
  expect((await rpc(owner, 'workspace_settings_get', [w])).role).toBe('member')
  await expect(
    rpc(owner, 'workspace_mutate', [w, s.version, id, 'transfer', data]),
  ).resolves.toEqual({ ok: true, mutation_id: id })
  await expect(
    mutate(w, 'transfer', { user_id: member }, owner),
  ).rejects.toThrow('OWNER_REQUIRED')
})
it('deferred invariant rejects orphan owner and mismatched owner_id', async () => {
  const w = await setup()
  await expect(
    db.query(
      "delete from public.workspace_members where workspace_id=$1 and role='owner'",
      [w],
    ),
  ).rejects.toThrow('WORKSPACE_OWNER_INVARIANT')
  await expect(
    db.query('update public.workspaces set owner_id=$2 where id=$1', [
      w,
      member,
    ]),
  ).rejects.toThrow('WORKSPACE_OWNER_INVARIANT')
  await expect(mutate(w, 'leave')).rejects.toThrow('OWNER_MUST_TRANSFER')
})
it('leave clears assignment, preserves content, retries ACK without read access', async () => {
  const w = await setup(),
    board = randomUUID(),
    task = randomUUID()
  await rpc(owner, 'board_create', [w, board, 'G1'])
  await rpc(owner, 'board_mutate', [
    board,
    1,
    randomUUID(),
    'save_task',
    {
      id: task,
      title: 'Assigned',
      description: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: member,
      due_date: '',
    },
  ])
  const s = await rpc(member, 'workspace_settings_get', [w]),
    id = randomUUID()
  await rpc(member, 'workspace_mutate', [w, s.version, id, 'leave', {}])
  await expect(rpc(member, 'workspace_settings_get', [w])).rejects.toThrow(
    'WORKSPACE_ACCESS_DENIED',
  )
  await expect(
    rpc(member, 'workspace_mutate', [w, s.version, id, 'leave', {}]),
  ).resolves.toEqual({ ok: true, mutation_id: id })
  const snap = await rpc(owner, 'board_snapshot', [board])
  expect(snap.tasks[0].assignee_id).toBeNull()
  expect(snap.board.version).toBe(3)
})
it('archive blocks legacy writes, revokes invitations, keeps reads and restore semantics', async () => {
  const w = await setup(),
    board = randomUUID(),
    task = randomUUID()
  await rpc(owner, 'board_create', [w, board, 'G1'])
  await rpc(owner, 'board_mutate', [
    board,
    1,
    randomUUID(),
    'save_task',
    {
      id: task,
      title: 'Keep',
      description: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: null,
      due_date: '',
    },
  ])
  const token = await rpc(owner, 'workspace_invite', [
    w,
    'later@example.test',
    'member',
  ])
  await mutate(w, 'archive')
  for (const [name, args] of [
    ['workspace_rename', [w, 'Forbidden']],
    ['workspace_member_change', [w, member, 'viewer']],
    ['workspace_invite', [w, 'x@example.test', 'member']],
    ['board_create', [w, randomUUID(), 'Forbidden']],
    ['board_mutate', [board, 2, randomUUID(), 'rename', { name: 'Forbidden' }]],
    ['task_comment_add', [board, task, randomUUID(), 'Forbidden']],
  ] as [string, unknown[]][])
    await expect(rpc(owner, name, args)).rejects.toThrow('WORKSPACE_ARCHIVED')
  expect(
    (await rpc(member, 'board_snapshot', [board])).workspace.archived_at,
  ).toBeTruthy()
  expect((await rpc(member, 'task_thread', [board, task])).can_comment).toBe(
    false,
  )
  await expect(
    rpc(owner, 'workspace_invitation_preview', [token]),
  ).rejects.toThrow()
  await mutate(w, 'leave', {}, viewer)
  await mutate(w, 'restore')
  await expect(
    rpc(owner, 'workspace_invitation_preview', [token]),
  ).rejects.toThrow()
  expect((await rpc(member, 'task_thread', [board, task])).can_comment).toBe(
    true,
  )
})
it('audit only owner, cursor does not repeat and private functions cannot bypass guards', async () => {
  const w = await setup()
  await expect(rpc(member, 'workspace_activity_list', [w])).rejects.toThrow(
    'OWNER_REQUIRED',
  )
  const first = await rpc(owner, 'workspace_activity_list', [w, null, 2])
  expect(first).toHaveLength(2)
  const older = await rpc(owner, 'workspace_activity_list', [w, first[1].id, 2])
  expect(older.every((a: any) => !first.some((b: any) => a.id === b.id))).toBe(
    true,
  )
  await expect(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query('select workspace_internal.workspace_rename($1,$2)', [
        w,
        'Bypass',
      ])
    }),
  ).rejects.toThrow('permission denied')
})
