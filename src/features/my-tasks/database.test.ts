import { beforeAll, afterAll, it, expect } from 'vitest'
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
it('scopes to current assignee, supports Viewer, excludes outsiders and unverified accounts', async () => {
  const { w, b } = await setup('viewer'),
    id = await task(b)
  expect(
    (await query(member, { workspace: w })).items.map((t: any) => t.id),
  ).toEqual([id])
  expect((await query(owner, { workspace: w })).total).toBe(0)
  const denied = await query(outsider, { workspace: w })
  expect(denied.total).toBe(0)
  expect(denied.options.workspaces).toEqual([])
  await expect(query(unverified)).rejects.toThrow('VERIFIED_ACCOUNT_REQUIRED')
  await db.query(
    'delete from public.workspace_members where workspace_id=$1 and user_id=$2',
    [w, member],
  )
  expect((await query(member, { workspace: w })).total).toBe(0)
})
it('filters literals, status, priority, labels and dates; stable pagination clamps after shrink', async () => {
  const { w, b } = await setup(),
    label = randomUUID()
  const ids = []
  for (let i = 0; i < 5; i++)
    ids.push(await task(b, { due_date: '2026-10-10' }))
  await task(b, { status: 'done', priority: 'low', due_date: '2026-10-12' })
  let s = await rpc(owner, 'board_snapshot', [b])
  await rpc(owner, 'board_mutate', [
    b,
    s.board.version,
    randomUUID(),
    'label_save',
    { id: label, name: 'Bug', color: 'red' },
  ])
  s = await rpc(owner, 'board_snapshot', [b])
  await rpc(owner, 'board_mutate', [
    b,
    s.board.version,
    randomUUID(),
    'task_labels',
    { id: ids[0], label_ids: [label] },
  ])
  expect((await query(member, { workspace: w, label })).items[0].id).toBe(
    ids[0],
  )
  expect(
    (
      await query(member, {
        workspace: w,
        search: '100%',
        priority: 'high',
        from: '2026-10-10',
        to: '2026-10-10',
      })
    ).total,
  ).toBe(5)
  expect(
    (await query(member, { workspace: w, view: 'completed', status: 'done' }))
      .total,
  ).toBe(1)
  expect((await query(member, { workspace: w, search: '100_' })).total).toBe(0)
  const first = await query(member, { workspace: w }, 1, 2),
    second = await query(member, { workspace: w }, 2, 2)
  expect([...first.items, ...second.items].map((t: any) => t.id)).toEqual(
    ids.sort().slice(0, 4),
  )
  expect((await query(member, { workspace: w }, 99, 2)).page).toBe(3)
  await db.query(
    'update public.board_tasks set archived_at=now() where board_id=$1',
    [b],
  )
  expect((await query(member, { workspace: w }, 99, 2)).page).toBe(1)
  expect((await query(member, { workspace: w })).total).toBe(0)
})
it('uses each workspace local date, excludes archived boards and workspaces', async () => {
  const a = await setup(),
    b = await setup()
  await db.query(
    "update public.workspaces set timezone='Pacific/Kiritimati' where id=$1",
    [a.w],
  )
  await db.query(
    "update public.workspaces set timezone='Pacific/Honolulu' where id=$1",
    [b.w],
  )
  const date = (
    await db.query<{ d: string }>(
      "select to_char(now() at time zone 'Pacific/Honolulu','YYYY-MM-DD') d",
    )
  ).rows[0]!.d
  await task(a.b, { due_date: date })
  await task(b.b, { due_date: date })
  expect((await query(member, { workspace: a.w, view: 'overdue' })).total).toBe(
    1,
  )
  expect((await query(member, { workspace: b.w, view: 'today' })).total).toBe(1)
  await db.query('update public.boards set archived_at=now() where id=$1', [
    a.b,
  ])
  await db.query('update public.workspaces set archived_at=now() where id=$1', [
    b.w,
  ])
  expect((await query(member, { workspace: a.w, view: 'all' })).total).toBe(0)
  expect(
    (
      await query(member, { workspace: b.w, view: 'all' })
    ).options.workspaces.some((w: any) => w.id === b.w),
  ).toBe(false)
})
it('validates query operators, types, dates and page limits', async () => {
  for (const f of [
    { user_id: owner },
    { view: 'unknown' },
    { search: null },
    { from: '2026-02-31' },
    { from: '2026-10-10', to: '2026-10-01' },
  ])
    await expect(query(member, f)).rejects.toThrow()
  await expect(query(member, {}, 0)).rejects.toThrow('INVALID_PAGE')
  await expect(query(member, {}, 1, 51)).rejects.toThrow('INVALID_PAGE')
})
it('saved filters are private, versioned and idempotent including delete retry', async () => {
  const id = randomUUID(),
    receipt = randomUUID(),
    args = [id, 0, receipt, 'save', 'My preset', { priority: 'high' }]
  const ack = await rpc(member, 'task_saved_filter_mutate', args)
  expect(await rpc(member, 'task_saved_filter_mutate', args)).toEqual(ack)
  expect(
    (await query(member)).saved.find((s: any) => s.id === id).version,
  ).toBe(1)
  expect((await query(owner)).saved.some((s: any) => s.id === id)).toBe(false)
  await expect(
    rpc(owner, 'task_saved_filter_mutate', [
      id,
      1,
      randomUUID(),
      'save',
      'Hijack',
      {},
    ]),
  ).rejects.toThrow('FILTER_ACCESS_DENIED')
  await expect(
    rpc(member, 'task_saved_filter_mutate', [
      id,
      0,
      randomUUID(),
      'save',
      'Stale',
      {},
    ]),
  ).rejects.toThrow('FILTER_CONFLICT')
  await expect(
    rpc(member, 'task_saved_filter_mutate', [
      id,
      0,
      receipt,
      'save',
      'Changed',
      {},
    ]),
  ).rejects.toThrow('MUTATION_REUSED')
  await expect(
    rpc(member, 'task_saved_filter_mutate', [
      randomUUID(),
      0,
      randomUUID(),
      'save',
      'my preset',
      {},
    ]),
  ).rejects.toThrow()
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ])
    expect(
      (
        await tx.query('select * from public.task_saved_filters where id=$1', [
          id,
        ])
      ).rows,
    ).toEqual([])
  })
  await expect(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query('delete from public.task_saved_filters where id=$1', [id])
    }),
  ).rejects.toThrow()
  const del = [id, 1, randomUUID(), 'delete', '', {}]
  await rpc(member, 'task_saved_filter_mutate', del)
  await expect(
    rpc(member, 'task_saved_filter_mutate', del),
  ).resolves.toMatchObject({ ok: true })
  expect((await query(member)).saved.some((s: any) => s.id === id)).toBe(false)
})
