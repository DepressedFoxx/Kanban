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
describe('online boards SQL', () => {
  it('creates idempotently and only permits owners to manage boards', async () => {
    await asUser(owner, 'select public.board_create($1,$2,$3)', [
      workspace,
      boardId,
      'Board A',
    ])
    expect(
      (await asUser(owner, 'select * from public.board_list($1)', [workspace]))
        .rows,
    ).toHaveLength(1)
    await join()
    await expect(
      mutate('rename', { name: 'Denied' }, 1, member),
    ).rejects.toThrow('OWNER_REQUIRED')
    await expect(
      asUser(member, 'select public.board_create($1,$2,$3)', [
        workspace,
        crypto.randomUUID(),
        'No',
      ]),
    ).rejects.toThrow('OWNER_REQUIRED')
    expect((await mutate('rename', { name: 'Renamed' }, 1)).board.name).toBe(
      'Renamed',
    )
  })
  it('rejects outsiders, unverified users and anonymous callers; applies direct-read RLS', async () => {
    for (const user of [outsider, unverified]) {
      await expect(snapshot(user)).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
      expect(
        (await asUser(user, 'select * from public.boards')).rows,
      ).toHaveLength(0)
      expect(
        (await asUser(user, 'select * from public.board_tasks')).rows,
      ).toHaveLength(0)
    }
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query('select public.board_snapshot($1)', [boardId])
      }),
    ).rejects.toThrow()
    await expect(
      asUser(owner, "update public.boards set name='Bypass' where id=$1", [
        boardId,
      ]),
    ).rejects.toThrow('permission denied')
  })
  it('lets members edit and viewers read only', async () => {
    await join()
    const saved = await mutate('save_task', taskInput(), 1, member)
    expect(saved.tasks).toHaveLength(1)
    await asUser(owner, 'select public.workspace_member_change($1,$2,$3)', [
      workspace,
      member,
      'viewer',
    ])
    expect((await snapshot(member)).tasks).toHaveLength(1)
    await expect(
      mutate('save_task', taskInput(taskTwo), 2, member),
    ).rejects.toThrow('WRITE_DENIED')
    await expect(
      asUser(
        member,
        "insert into public.board_tasks(id,board_id,title,status,priority,position) values($1,$2,'Bad','todo','low',0)",
        [taskTwo, boardId],
      ),
    ).rejects.toThrow('permission denied')
  })
  it('validates titles, dates and workspace assignees atomically', async () => {
    await expect(
      mutate('save_task', { ...taskInput(), title: '  ' }, 1),
    ).rejects.toThrow()
    await expect(
      mutate('save_task', { ...taskInput(), due_date: '2026-02-30' }, 1),
    ).rejects.toThrow()
    await expect(
      mutate('save_task', { ...taskInput(), assignee_id: outsider }, 1),
    ).rejects.toThrow('INVALID_ASSIGNEE')
    expect((await snapshot()).board.version).toBe(1)
    expect((await snapshot()).tasks).toHaveLength(0)
  })
  it('rejects stale writes and replays identical receipts without duplicating work', async () => {
    const mutation = crypto.randomUUID()
    await mutate('save_task', taskInput(), 1, owner, mutation)
    const retry = await mutate('save_task', taskInput(), 1, owner, mutation)
    expect(retry.tasks).toHaveLength(1)
    expect(retry.board.version).toBe(2)
    await expect(mutate('save_task', taskInput(taskTwo), 1)).rejects.toThrow(
      'BOARD_CONFLICT',
    )
    await expect(
      mutate(
        'save_task',
        { ...taskInput(), title: 'Changed' },
        1,
        owner,
        mutation,
      ),
    ).rejects.toThrow('MUTATION_REUSED')
  })
  it('moves atomically within and between columns without dropping cards', async () => {
    await mutate('save_task', taskInput(), 1)
    await mutate('save_task', taskInput(taskTwo), 2)
    let value = await mutate(
      'move_task',
      { id: taskTwo, status: 'todo', position: 0 },
      3,
    )
    expect(value.tasks.map((t: any) => t.id)).toEqual([taskTwo, taskId])
    value = await mutate(
      'move_task',
      { id: taskId, status: 'doing', position: 0 },
      4,
    )
    expect(value.tasks).toHaveLength(2)
    expect(value.tasks.find((t: any) => t.id === taskId).status).toBe('doing')
    await expect(
      mutate('move_task', { id: taskTwo, status: 'doing', position: 0 }, 4),
    ).rejects.toThrow('BOARD_CONFLICT')
    expect(
      (await snapshot()).tasks.find((t: any) => t.id === taskTwo).status,
    ).toBe('todo')
  })
  it('archives boards as read-only and restores them', async () => {
    await mutate('save_task', taskInput(), 1)
    await mutate('archive_board', {}, 2)
    await expect(mutate('save_task', taskInput(taskTwo), 3)).rejects.toThrow(
      'BOARD_ARCHIVED',
    )
    await expect(mutate('rename', { name: 'No' }, 3)).rejects.toThrow(
      'BOARD_ARCHIVED',
    )
    expect((await snapshot()).tasks).toHaveLength(1)
    await mutate('restore_board', {}, 3)
    expect(
      (await mutate('save_task', taskInput(taskTwo), 4)).tasks,
    ).toHaveLength(2)
  })
  it('archives and restores tasks and prevents editing archived drafts', async () => {
    await mutate('save_task', taskInput(), 1)
    expect(
      (await mutate('archive_task', { id: taskId }, 2)).tasks[0].archived_at,
    ).not.toBeNull()
    await expect(mutate('save_task', taskInput(), 3)).rejects.toThrow(
      'TASK_ARCHIVED',
    )
    expect(
      (await mutate('restore_task', { id: taskId }, 3)).tasks[0].archived_at,
    ).toBeNull()
  })
  it('removes assignments and denies later reads/writes after membership removal', async () => {
    await join()
    await mutate('save_task', { ...taskInput(), assignee_id: member }, 1)
    await asUser(owner, 'select public.workspace_member_remove($1,$2)', [
      workspace,
      member,
    ])
    const value = await snapshot()
    expect(value.tasks[0].assignee_id).toBeNull()
    expect(value.board.version).toBe(3)
    await expect(snapshot(member)).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
    await expect(
      mutate('save_task', taskInput(taskTwo), 3, member),
    ).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
  })
  it('cannot mutate another board task through a permitted board ID', async () => {
    const otherWorkspace = (
      await asUser(outsider, "select public.workspace_create('Other') as id")
    ).rows[0]!.id
    const otherBoard = crypto.randomUUID()
    await asUser(outsider, 'select public.board_create($1,$2,$3)', [
      otherWorkspace,
      otherBoard,
      'Private',
    ])
    await asUser(outsider, 'select public.board_mutate($1,1,$2,$3,$4)', [
      otherBoard,
      crypto.randomUUID(),
      'save_task',
      JSON.stringify(taskInput()),
    ])
    await expect(
      mutate('move_task', { id: taskId, status: 'done', position: 0 }, 1),
    ).rejects.toThrow('TASK_NOT_FOUND')
    await expect(mutate('save_task', taskInput(), 1)).rejects.toThrow()
    expect((await snapshot()).tasks).toHaveLength(0)
  })
})
