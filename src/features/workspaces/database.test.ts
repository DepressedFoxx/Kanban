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
      resolve('supabase/migrations/202609300004_invitation_preview.sql'),
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
describe('workspace SQL authorization', () => {
  it('creates exactly one owner and only lists memberships', async () => {
    const list = await asUser(owner, 'select * from public.workspace_list()')
    expect(list.rows).toHaveLength(1)
    expect(list.rows[0]!.role).toBe('owner')
    expect(
      (await asUser(outsider, 'select * from public.workspace_list()')).rows,
    ).toHaveLength(0)
    expect(
      (await asUser(owner, 'select * from public.workspace_members')).rows,
    ).toHaveLength(1)
  })
  it('enforces RLS on direct reads and denies direct membership writes', async () => {
    expect(
      (await asUser(outsider, 'select * from public.workspaces')).rows,
    ).toHaveLength(0)
    expect(
      (await asUser(outsider, 'select * from public.workspace_members')).rows,
    ).toHaveLength(0)
    await expect(
      asUser(
        outsider,
        "insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'owner')",
        [workspace, outsider],
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(owner, 'select * from public.workspace_invitations'),
    ).rejects.toThrow(/permission denied/)
  })
  it('requires verified users and denies anonymous RPCs', async () => {
    await expect(
      asUser(unverified, "select public.workspace_create('No')"),
    ).rejects.toThrow('VERIFIED_ACCOUNT_REQUIRED')
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query('select public.workspace_list()')
      }),
    ).rejects.toThrow(/permission denied/)
  })
  it('rejects invalid names atomically', async () => {
    await expect(
      asUser(owner, "select public.workspace_create('  ')"),
    ).rejects.toThrow()
    expect(
      (await asUser(owner, 'select * from public.workspace_list()')).rows,
    ).toHaveLength(1)
  })
  it('matches verified email and accepts a link idempotently', async () => {
    const token = await invite(' MEMBER@example.com ')
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    await expect(
      asUser(outsider, 'select public.workspace_invitation_accept($1)', [
        token,
      ]),
    ).rejects.toThrow('INVITATION_EMAIL_MISMATCH')
    for (let i = 0; i < 2; i++)
      await asUser(member, 'select public.workspace_invitation_accept($1)', [
        token,
      ])
    expect(
      (
        await asUser(owner, 'select * from public.workspace_member_list($1)', [
          workspace,
        ])
      ).rows,
    ).toHaveLength(2)
    const rows = await db.query<{ token_hash: string }>(
      'select token_hash from public.workspace_invitations',
    )
    expect(rows.rows[0]!.token_hash).not.toBe(token)
  })
  it('denies member and viewer management requests', async () => {
    await join('viewer')
    for (const role of ['viewer', 'member']) {
      await asUser(owner, 'select public.workspace_member_change($1,$2,$3)', [
        workspace,
        member,
        role,
      ])
      await expect(
        asUser(member, "select public.workspace_rename($1,'Hacked')", [
          workspace,
        ]),
      ).rejects.toThrow('OWNER_REQUIRED')
      await expect(
        asUser(
          member,
          "select public.workspace_invite($1,'outsider@example.com','owner')",
          [workspace],
        ),
      ).rejects.toThrow('OWNER_REQUIRED')
      await expect(
        asUser(member, 'select public.workspace_invitation_list($1)', [
          workspace,
        ]),
      ).rejects.toThrow('OWNER_REQUIRED')
      await expect(
        asUser(member, 'select public.workspace_member_remove($1,$2)', [
          workspace,
          owner,
        ]),
      ).rejects.toThrow('OWNER_REQUIRED')
    }
  })
  it('protects the owner and rejects owner role escalation', async () => {
    await join()
    await expect(
      asUser(owner, "select public.workspace_member_change($1,$2,'viewer')", [
        workspace,
        owner,
      ]),
    ).rejects.toThrow('MEMBER_NOT_EDITABLE')
    await expect(
      asUser(owner, 'select public.workspace_member_remove($1,$2)', [
        workspace,
        owner,
      ]),
    ).rejects.toThrow('MEMBER_NOT_EDITABLE')
    await expect(
      asUser(owner, "select public.workspace_member_change($1,$2,'owner')", [
        workspace,
        member,
      ]),
    ).rejects.toThrow('INVALID_ROLE')
  })
  it('removes access and prevents reuse of an accepted invitation after removal', async () => {
    const token = await join()
    await asUser(owner, 'select public.workspace_member_remove($1,$2)', [
      workspace,
      member,
    ])
    await expect(
      asUser(member, 'select public.workspace_member_list($1)', [workspace]),
    ).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
    expect(
      (await asUser(member, 'select * from public.workspaces')).rows,
    ).toHaveLength(0)
    await expect(
      asUser(member, 'select public.workspace_invitation_accept($1)', [token]),
    ).rejects.toThrow('INVITATION_INVALID')
  })
  it('rejects revoked, replaced and expired links', async () => {
    const old = await invite()
    const newer = await invite()
    await expect(
      asUser(member, 'select public.workspace_invitation_accept($1)', [old]),
    ).rejects.toThrow('INVITATION_INVALID')
    const list = await asUser(
      owner,
      'select * from public.workspace_invitation_list($1)',
      [workspace],
    )
    await asUser(owner, 'select public.workspace_invitation_revoke($1,$2)', [
      workspace,
      list.rows.find((row) => row.revoked_at === null)!.id,
    ])
    await expect(
      asUser(member, 'select public.workspace_invitation_accept($1)', [newer]),
    ).rejects.toThrow('INVITATION_INVALID')
    const expired = await invite()
    await db.query(
      "update public.workspace_invitations set expires_at=now()-interval '1 second'",
    )
    await expect(
      asUser(member, 'select public.workspace_invitation_accept($1)', [
        expired,
      ]),
    ).rejects.toThrow('INVITATION_INVALID')
  })
  it('does not expose another workspace even to an owner elsewhere', async () => {
    const other = (
      await asUser(outsider, "select public.workspace_create('Team B') as id")
    ).rows[0]!.id
    await expect(
      asUser(owner, 'select public.workspace_member_list($1)', [other]),
    ).rejects.toThrow('WORKSPACE_ACCESS_DENIED')
    await expect(
      asUser(owner, "select public.workspace_rename($1,'No')", [other]),
    ).rejects.toThrow('OWNER_REQUIRED')
  })
})

describe('invitation preview', () => {
  it('shows only the recipient workspace and role without accepting', async () => {
    const token = await invite('member@example.com', 'viewer')
    const result = await asUser(
      member,
      'select public.workspace_invitation_preview($1) as preview',
      [token],
    )
    expect(result.rows[0]!.preview).toMatchObject({
      workspace_name: 'Team A',
      role: 'viewer',
    })
    expect(
      (await asUser(member, 'select * from public.workspace_list()')).rows,
    ).toHaveLength(0)
    await expect(
      asUser(outsider, 'select public.workspace_invitation_preview($1)', [
        token,
      ]),
    ).rejects.toThrow('INVITATION_EMAIL_MISMATCH')
    await expect(
      asUser(unverified, 'select public.workspace_invitation_preview($1)', [
        token,
      ]),
    ).rejects.toThrow('VERIFIED_ACCOUNT_REQUIRED')
    await db.exec('update public.workspace_invitations set revoked_at=now()')
    await expect(
      asUser(member, 'select public.workspace_invitation_preview($1)', [token]),
    ).rejects.toThrow('INVITATION_INVALID')
  })
  it('rejects expired, accepted, invalid tokens and anonymous callers', async () => {
    const token = await invite()
    await db.exec(
      "update public.workspace_invitations set expires_at=now()-interval '1 second'",
    )
    await expect(
      asUser(member, 'select public.workspace_invitation_preview($1)', [token]),
    ).rejects.toThrow('INVITATION_INVALID')
    const accepted = await join()
    await expect(
      asUser(member, 'select public.workspace_invitation_preview($1)', [
        accepted,
      ]),
    ).rejects.toThrow('INVITATION_INVALID')
    await expect(
      asUser(member, 'select public.workspace_invitation_preview($1)', ['bad']),
    ).rejects.toThrow('INVITATION_INVALID')
    await expect(
      db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query('select public.workspace_invitation_preview($1)', [
          token,
        ])
      }),
    ).rejects.toThrow('permission denied')
  })
})
