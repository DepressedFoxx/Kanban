import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
let db: PGlite
const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
] as const
const [owner, member, outsider, unverified] = ids
async function asUser(user: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user])
    return tx.query<Record<string, unknown>>(sql, params)
  })
}
let workspace: string
async function invite(email = 'member@example.com', role = 'member') {
  const result = await asUser(
    owner,
    'select public.workspace_invite($1,$2,$3) as token',
    [workspace, email, role],
  )
  return result.rows[0]!.token as string
}
async function join(role = 'member') {
  const token = await invite('member@example.com', role)
  await asUser(member, 'select public.workspace_invitation_accept($1)', [token])
  return token
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`)
  for (let i = 0; i < ids.length; i++)
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',
      [
        ids[i],
        [
          'owner@example.com',
          'member@example.com',
          'outsider@example.com',
          'unverified@example.com',
        ][i],
        i === 3 ? null : '2026-09-29T00:00:00Z',
      ],
    )
  await db.exec(
    readFileSync(
      resolve('supabase/migrations/202609300001_workspaces.sql'),
      'utf8',
    ),
  )
  await db.exec(
    readFileSync(
      resolve('supabase/migrations/202609300002_boards.sql'),
      'utf8',
    ),
  )
  await db.exec(
    readFileSync(
      resolve('supabase/migrations/202609300003_task_details.sql'),
      'utf8',
    ),
  )
}, 60000)
beforeEach(async () => {
  await db.exec('truncate public.workspaces cascade')
  workspace = (
    await asUser(owner, "select public.workspace_create('Team A') as id")
  ).rows[0]!.id as string
})
afterAll(async () => {
  await db?.close()
})

const boardId = '20000000-0000-4000-8000-000000000001'
const taskId = '30000000-0000-4000-8000-000000000001'
const taskTwo = '30000000-0000-4000-8000-000000000002'
const taskInput = (id = taskId) => ({
  id,
  title: 'Task',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
  due_date: '',
})
async function snapshot(user: string = owner) {
  return (
    await asUser(user, 'select public.board_snapshot($1) as value', [boardId])
  ).rows[0]!.value as any
}
async function mutate(
  action: string,
  data: unknown,
  version: number,
  user: string = owner,
  mutation = crypto.randomUUID(),
) {
  return (
    await asUser(user, 'select public.board_mutate($1,$2,$3,$4,$5) as value', [
      boardId,
      version,
      mutation,
      action,
      JSON.stringify(data),
    ])
  ).rows[0]!.value as any
}
beforeEach(async () => {
  await asUser(owner, 'select public.board_create($1,$2,$3)', [
    workspace,
    boardId,
    'Board A',
  ])
})

beforeEach(async () => {
  await mutate('save_task', taskInput(), 1)
})
async function thread(
  user: string = owner,
  board = boardId,
  task = taskId,
  cursors: unknown[] = [null, null, null],
) {
  return (
    await asUser(user, 'select public.task_thread($1,$2,$3,$4,$5) as value', [
      board,
      task,
      ...cursors,
    ])
  ).rows[0]!.value as any
}
async function comment(
  body = 'Hello',
  user: string = owner,
  id = crypto.randomUUID(),
) {
  return (
    await asUser(user, 'select public.task_comment_add($1,$2,$3,$4) as value', [
      boardId,
      taskId,
      id,
      body,
    ])
  ).rows[0]!.value as any
}
describe('task detail SQL', () => {
  it('records task creation and field changes with server-owned actor', async () => {
    let data = await thread()
    expect(data.activity).toHaveLength(1)
    expect(data.activity[0].action).toBe('created')
    expect(data.activity[0].actor_id).toBe(owner)
    await mutate(
      'save_task',
      { ...taskInput(), title: 'Renamed', due_date: '2026-10-01' },
      2,
    )
    data = await thread()
    expect(data.activity[0].changes.title).toEqual({
      before: 'Task',
      after: 'Renamed',
    })
    expect(data.activity[0].changes.due_date.after).toBe('2026-10-01')
  })
  it('does not create activity for no-op, failed writes or retried mutations', async () => {
    await mutate('save_task', taskInput(), 2)
    expect((await thread()).activity).toHaveLength(1)
    await expect(
      mutate('save_task', { ...taskInput(), title: ' ' }, 3),
    ).rejects.toThrow()
    expect((await thread()).activity).toHaveLength(1)
    const mutation = crypto.randomUUID()
    await mutate(
      'move_task',
      { id: taskId, status: 'doing', position: 0 },
      3,
      owner,
      mutation,
    )
    await mutate(
      'move_task',
      { id: taskId, status: 'doing', position: 0 },
      3,
      owner,
      mutation,
    )
    expect((await thread()).activity).toHaveLength(2)
  })
  it('records archive, restore and assignment removal without losing history', async () => {
    await join()
    await mutate('save_task', { ...taskInput(), assignee_id: member }, 2)
    await asUser(owner, 'select public.workspace_member_remove($1,$2)', [
      workspace,
      member,
    ])
    let data = await thread()
    expect(data.activity[0].changes.assignee_id).toEqual({
      before: member,
      after: null,
    })
    expect(data.activity[0].actor_id).toBe(owner)
    await mutate('archive_task', { id: taskId }, 4)
    expect((await thread()).activity[0].action).toBe('archived')
    await mutate('restore_task', { id: taskId }, 5)
    expect((await thread()).activity[0].action).toBe('restored')
  })
  it('trims comments, derives authors and deduplicates retries', async () => {
    await join()
    const id = crypto.randomUUID()
    let data = await comment('  Hello  ', member, id)
    expect(data.comments[0].body).toBe('Hello')
    expect(data.comments[0].actor_id).toBe(member)
    data = await comment('Hello', member, id)
    expect(data.comments).toHaveLength(1)
    await expect(comment('Changed', member, id)).rejects.toThrow(
      'MUTATION_REUSED',
    )
    expect((await snapshot()).board.version).toBe(2)
  })
  it('rejects blank or oversized comments and archived targets', async () => {
    await expect(comment(' ')).rejects.toThrow()
    await expect(comment('x'.repeat(2001))).rejects.toThrow()
    await mutate('archive_task', { id: taskId }, 2)
    expect((await thread()).can_comment).toBe(false)
    await expect(comment()).rejects.toThrow('TASK_ARCHIVED')
    await mutate('restore_task', { id: taskId }, 3)
    await mutate('archive_board', {}, 4)
    await expect(comment()).rejects.toThrow('BOARD_ARCHIVED')
  })
  it('allows Viewer read but denies writes and outsider or unverified access', async () => {
    await comment()
    await join('viewer')
    expect((await thread(member)).comments).toHaveLength(1)
    expect((await thread(member)).can_comment).toBe(false)
    await expect(comment('No', member)).rejects.toThrow('WRITE_DENIED')
    for (const user of [outsider, unverified]) {
      await expect(thread(user)).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
      await expect(comment('No', user)).rejects.toThrow(
        'WORKSPACE_ACCESS_DENIED',
      )
      expect(
        (await asUser(user, 'select * from public.task_comments')).rows,
      ).toHaveLength(0)
      expect(
        (await asUser(user, 'select * from public.task_activity')).rows,
      ).toHaveLength(0)
    }
  })
  it('rejects direct comment/audit writes and anonymous reads', async () => {
    await expect(
      asUser(
        owner,
        "insert into public.task_comments(id,task_id,actor_id,actor_name,body) values(gen_random_uuid(),$1,$2,'Fake','X')",
        [taskId, outsider],
      ),
    ).rejects.toThrow('permission denied')
    await expect(
      asUser(owner, 'delete from public.task_activity'),
    ).rejects.toThrow('permission denied')
    await expect(
      asUser(owner, "update public.task_activity set actor_name='Fake'"),
    ).rejects.toThrow('permission denied')
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query('select public.task_thread($1,$2)', [boardId, taskId])
      }),
    ).rejects.toThrow()
  })
  it('enforces task-board association and revokes reads after membership removal', async () => {
    const other = crypto.randomUUID()
    await asUser(owner, 'select public.board_create($1,$2,$3)', [
      workspace,
      other,
      'Other',
    ])
    await expect(thread(owner, other)).rejects.toThrow('TASK_NOT_FOUND')
    await join()
    await asUser(owner, 'select public.workspace_member_remove($1,$2)', [
      workspace,
      member,
    ])
    await expect(thread(member)).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
  })
  it('paginates tied timestamps deterministically without skipping comments or activities', async () => {
    for (let i = 0; i < 52; i++) await comment('Comment ' + i)
    await db.exec(
      "update public.task_comments set created_at='2026-09-30T00:00:00Z'",
    )
    const first = await thread()
    expect(first.comments).toHaveLength(50)
    const last = first.comments.at(-1)
    const second = await thread(owner, boardId, taskId, [
      last.created_at,
      last.id,
      null,
    ])
    expect(second.comments).toHaveLength(2)
    expect(
      new Set([...first.comments, ...second.comments].map((c: any) => c.id))
        .size,
    ).toBe(52)
    for (let i = 0; i < 51; i++)
      await mutate('save_task', { ...taskInput(), title: 'Title ' + i }, i + 2)
    const a = await thread()
    expect(a.activity).toHaveLength(50)
    const b = await thread(owner, boardId, taskId, [
      null,
      null,
      a.activity.at(-1).id,
    ])
    expect(b.activity).toHaveLength(2)
  })
})
