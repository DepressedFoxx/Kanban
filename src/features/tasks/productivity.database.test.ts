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

async function board() {
  const w = await setup(),
    b = randomUUID(),
    t = randomUUID()
  await rpc(owner, 'board_create', [w, b, 'G2 board'])
  await rpc(owner, 'board_mutate', [
    b,
    1,
    randomUUID(),
    'save_task',
    {
      id: t,
      title: 'Task',
      description: 'Body',
      status: 'todo',
      priority: 'medium',
      assignee_id: member,
      due_date: '2026-10-15',
    },
  ])
  return { w, b, t }
}
async function change(
  b: string,
  action: string,
  data: unknown,
  user = owner,
  version?: number,
  id = randomUUID(),
) {
  const s = await rpc(user, 'board_snapshot', [b])
  return rpc(user, 'board_mutate', [
    b,
    version ?? s.board.version,
    id,
    action,
    data,
  ])
}
it('catalog enforces owner, uniqueness, workspace scope and RLS', async () => {
  const { b, t } = await board(),
    other = await board(),
    label = randomUUID()
  await expect(
    change(b, 'label_save', { id: label, name: 'Bug', color: 'red' }, member),
  ).rejects.toThrow('OWNER_REQUIRED')
  await change(b, 'label_save', { id: label, name: 'Bug', color: 'red' })
  await expect(
    change(b, 'label_save', { id: randomUUID(), name: 'bug', color: 'blue' }),
  ).rejects.toThrow()
  await expect(
    change(other.b, 'task_labels', { id: other.t, label_ids: [label] }),
  ).rejects.toThrow('INVALID_LABELS')
  await expect(
    change(b, 'task_labels', { id: t, label_ids: [label] }, viewer),
  ).rejects.toThrow('WRITE_DENIED')
  await expect(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query(
        'insert into public.workspace_labels values($1,$2,$3,$4)',
        [randomUUID(), other.w, 'Bypass', 'blue'],
      )
    }),
  ).rejects.toThrow()
})
it('atomic details preserve rollback and receipt; delete label keeps task', async () => {
  const { b, t } = await board(),
    label = randomUUID(),
    item = randomUUID()
  await change(b, 'label_save', { id: label, name: 'Bug', color: 'red' })
  const s = await rpc(owner, 'board_snapshot', [b]),
    id = randomUUID()
  const data = {
    id: t,
    label_ids: [label],
    items: [{ id: item, body: 'Verify', done: true }],
  }
  const result = await change(
    b,
    'task_details',
    data,
    member,
    s.board.version,
    id,
  )
  expect(result.tasks[0].checklist[0].done).toBe(true)
  expect(result.board.version).toBe(s.board.version + 1)
  expect(
    (await change(b, 'task_details', data, member, s.board.version, id)).board
      .version,
  ).toBe(result.board.version)
  await expect(
    change(
      b,
      'task_details',
      { ...data, items: [] },
      member,
      s.board.version,
      id,
    ),
  ).rejects.toThrow('MUTATION_REUSED')
  await expect(
    change(b, 'task_details', {
      ...data,
      label_ids: [],
      items: [{ id: item, body: '', done: false }],
    }),
  ).rejects.toThrow()
  expect((await rpc(owner, 'board_snapshot', [b])).tasks[0].label_ids).toEqual([
    label,
  ])
  await expect(
    change(b, 'checklist', { id: t, items: [] }, member, s.board.version),
  ).rejects.toThrow('BOARD_CONFLICT')
  await change(b, 'label_delete', { id: label })
  const after = await rpc(owner, 'board_snapshot', [b])
  expect(after.tasks).toHaveLength(1)
  expect(after.tasks[0].label_ids).toEqual([])
})
it('duplicate resets checklist, copies labels and excludes discussion', async () => {
  const { b, t } = await board(),
    label = randomUUID(),
    copy = randomUUID()
  await change(b, 'label_save', { id: label, name: 'Copy', color: 'blue' })
  await change(b, 'task_details', {
    id: t,
    label_ids: [label],
    items: [{ id: randomUUID(), body: 'Done', done: true }],
  })
  await rpc(member, 'task_comment_add', [b, t, randomUUID(), 'Original only'])
  const s = await change(b, 'duplicate_task', { id: t, new_id: copy }, member)
  const copied = s.tasks.find((x: any) => x.id === copy)
  expect(copied.checklist[0].done).toBe(false)
  expect(copied.label_ids).toEqual([label])
  expect((await rpc(member, 'task_thread', [b, copy])).comments).toEqual([])
  expect((await rpc(member, 'task_thread', [b, copy])).activity).toHaveLength(1)
})
it('bulk is atomic, bounded, versioned and blocked by archive', async () => {
  const { w, b, t } = await board(),
    other = await board()
  await expect(
    change(b, 'bulk_archive', { ids: [t, other.t] }),
  ).rejects.toThrow('INVALID_TASK_SELECTION')
  expect(
    (await rpc(owner, 'board_snapshot', [b])).tasks[0].archived_at,
  ).toBeNull()
  await expect(
    change(b, 'bulk_status', { ids: Array(51).fill(t), status: 'done' }),
  ).rejects.toThrow()
  await change(b, 'bulk_status', { ids: [t], status: 'done' }, member)
  expect((await rpc(owner, 'board_snapshot', [b])).tasks[0].status).toBe('done')
  await mutate(w, 'archive')
  await expect(change(b, 'bulk_archive', { ids: [t] })).rejects.toThrow(
    'WORKSPACE_ARCHIVED',
  )
})
it('comment edit/delete enforce authorship, versions, moderation and tombstone', async () => {
  const { w, b, t } = await board(),
    c = randomUUID(),
    id = randomUUID()
  await rpc(member, 'task_comment_add', [b, t, c, 'Original'])
  const edit = (
    user: string,
    version: number,
    mutation: string,
    body: string,
  ) =>
    rpc(user, 'task_comment_mutate', [
      b,
      t,
      c,
      version,
      mutation,
      'edit',
      body,
      null,
    ])
  await expect(edit(owner, 1, id, 'Owner edit')).rejects.toThrow(
    'COMMENT_AUTHOR_REQUIRED',
  )
  await edit(member, 1, id, 'Edited')
  await edit(member, 1, id, 'Edited')
  await expect(edit(member, 1, randomUUID(), 'Stale')).rejects.toThrow(
    'COMMENT_CONFLICT',
  )
  await expect(
    rpc(owner, 'task_comment_mutate', [
      b,
      t,
      c,
      2,
      randomUUID(),
      'delete',
      null,
      '',
    ]),
  ).rejects.toThrow('REASON_REQUIRED')
  const deleted = await rpc(owner, 'task_comment_mutate', [
    b,
    t,
    c,
    2,
    randomUUID(),
    'delete',
    null,
    'Spam',
  ])
  expect(deleted.comments[0].body).toBeNull()
  expect(deleted.comments[0].deleted_at).toBeTruthy()
  const audit = await rpc(owner, 'workspace_activity_list', [w])
  expect(
    audit.filter((a: any) => a.action === 'comment_moderated'),
  ).toHaveLength(1)
  expect(JSON.stringify(audit)).not.toContain('Original')
  expect(JSON.stringify(audit)).not.toContain('Edited')
  await expect(edit(member, 3, randomUUID(), 'Restore')).rejects.toThrow(
    'COMMENT_DELETED',
  )
})
it('checklist rejects foreign IDs and preserves previous data on rollback', async () => {
  const a = await board(),
    b = await board(),
    item = randomUUID()
  await change(a.b, 'checklist', {
    id: a.t,
    items: [{ id: item, body: 'Keep', done: false }],
  })
  await expect(
    change(b.b, 'checklist', {
      id: b.t,
      items: [{ id: item, body: 'Steal', done: true }],
    }),
  ).rejects.toThrow()
  const s = await rpc(owner, 'board_snapshot', [a.b])
  expect(s.tasks[0].checklist[0].body).toBe('Keep')
})
