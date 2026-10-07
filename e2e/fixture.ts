import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const users = Object.fromEntries(
  ['owner', 'member', 'viewer', 'outsider'].map((name, index) => [
    name,
    {
      id: `10000000-0000-4000-8000-00000000000${index + 1}`,
      email: `${name}@example.test`,
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2026-10-01T00:00:00Z',
      app_metadata: { provider: 'email' },
      user_metadata: { display_name: name },
      created_at: '2026-10-01T00:00:00Z',
    },
  ]),
)
export const fixturePassword = 'LocalFixture!2026'
export class Harness {
  db!: PGlite
  workspace = ''
  board = randomUUID()
  task = randomUUID()
  loseNextWrite = false
  holdNextWrite = false
  failReads = false
  mutations: Record<string, unknown>[] = []
  async init() {
    this.db = new PGlite({ extensions: { pgcrypto } })
    await this.db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;`)
    for (const user of Object.values(users))
      await this.db.query('insert into auth.users values($1,$2,$3,$4)', [
        user.id,
        user.email,
        user.email_confirmed_at,
        user.user_metadata,
      ])
    for (const file of readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await this.db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
    this.workspace = await this.rpc('owner', 'workspace_create', {
      p_name: 'E2E Workspace',
    })
    for (const role of ['member', 'viewer']) {
      const token = await this.rpc('owner', 'workspace_invite', {
        p_workspace: this.workspace,
        p_email: users[role]!.email,
        p_role: role,
      })
      await this.rpc(role, 'workspace_invitation_accept', { p_token: token })
    }
    await this.rpc('owner', 'board_create', {
      p_workspace: this.workspace,
      p_id: this.board,
      p_name: 'E2E Board',
    })
    await this.save('owner', {
      id: this.task,
      title: 'E2E Task',
      description: 'Original description',
      status: 'todo',
      priority: 'medium',
      assignee_id: null,
      due_date: '',
    })
  }
  async rpc(
    actor: string,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<any> {
    // Only existing public RPCs, using parameter names declared in pg_proc.
    const signature = await this.db.query<{
      proargnames: string[] | null
      proretset: boolean
    }>(
      `select proargnames, proretset from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,
      [name],
    )
    const fn = signature.rows[0]
    if (!fn || !/^[a-z_]+$/.test(name)) throw new Error('Unknown test RPC')
    const keys = Object.keys(args)
    if (keys.some((k) => !fn.proargnames?.includes(k)))
      throw new Error('Unknown RPC argument')
    const call = `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')})`
    return this.db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        users[actor]!.id,
      ])
      const result = await tx.query<any>(
        fn.proretset ? `select * from ${call}` : `select ${call} as value`,
        keys.map((k) => args[k]),
      )
      return fn.proretset ? result.rows : result.rows[0]?.value
    })
  }
  async snapshot(actor = 'owner') {
    return this.rpc(actor, 'board_snapshot', { p_board: this.board })
  }
  async save(actor: string, data: Record<string, unknown>) {
    const snapshot = await this.snapshot(actor)
    return this.rpc(actor, 'board_mutate', {
      p_board: this.board,
      p_version: snapshot.board.version,
      p_mutation: randomUUID(),
      p_action: 'save_task',
      p_data: data,
    })
  }
  session(actor: string) {
    const user = users[actor]!
    const encoded = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.local-fixture-signature`
    return {
      access_token: token,
      refresh_token: `fixture-${actor}`,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    }
  }
  async attach(context: BrowserContext, actor = 'owner') {
    await context.routeWebSocket('**/realtime/**', (socket) => socket.close())
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin === 'http://127.0.0.1:5180') return route.continue()
      // Hard isolation: no accidental request can reach the real Supabase project.
      if (url.origin !== 'http://127.0.0.1:54329')
        return route.abort('blockedbyclient')
      const reply = (data: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(data),
        })
      if (url.pathname.startsWith('/auth/v1/')) {
        if (url.pathname.endsWith('/token')) {
          const body = route.request().postDataJSON()
          if (
            body.email !== users[actor]!.email ||
            body.password !== fixturePassword
          )
            return reply(
              {
                error_code: 'invalid_credentials',
                msg: 'Invalid login credentials',
              },
              400,
            )
          return reply(this.session(actor))
        }
        if (url.pathname.endsWith('/user')) return reply(users[actor])
        if (url.pathname.endsWith('/logout'))
          return route.fulfill({ status: 204 })
        if (
          url.pathname.endsWith('/recover') ||
          url.pathname.endsWith('/resend')
        )
          return reply({})
        if (url.pathname.endsWith('/signup'))
          return reply({
            user: { ...users[actor], email_confirmed_at: undefined },
            session: null,
          })
      }
      const name = url.pathname.split('/rest/v1/rpc/')[1]
      if (!name) return reply({ message: 'Unexpected fixture endpoint' }, 404)
      const args = route.request().postDataJSON() ?? {}
      if (
        ['board_snapshot', 'board_page_query'].includes(name) &&
        this.failReads
      )
        return route.abort('connectionfailed')
      if (['board_mutate', 'board_page_mutate'].includes(name)) {
        this.mutations.push(args)
        if (this.holdNextWrite) {
          this.holdNextWrite = false
          return
        } // leave pending until client deadline aborts
      }
      try {
        const result = await this.rpc(actor, name, args)
        if (
          (['board_mutate', 'board_page_mutate'].includes(name) ||
            name === 'task_saved_filter_mutate' ||
            name === 'notification_mutate' ||
            name === 'notification_invitation_accept') &&
          this.loseNextWrite
        ) {
          this.loseNextWrite = false
          return route.abort('connectionreset') // SQL committed; response deliberately lost
        }
        return reply(result)
      } catch (error) {
        const failure = error as { message: string; code?: string }
        return reply(
          { code: failure.code ?? 'XX000', message: failure.message },
          400,
        )
      }
    })
  }
}
export async function login(
  page: Page,
  actor = 'owner',
  destination = '/workspaces',
) {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`)
  await page.getByLabel('Email', { exact: true }).fill(users[actor]!.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(fixturePassword)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(
    (url) => url.pathname + url.search === destination,
  )
}
export const test = base.extend<{ harness: Harness }>({
  harness: async ({}, use) => {
    const harness = new Harness()
    await harness.init()
    try {
      await use(harness)
    } finally {
      await harness.db.close()
    }
  },
})
export { expect }
