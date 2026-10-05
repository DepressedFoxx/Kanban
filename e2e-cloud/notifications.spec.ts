import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
test('G4 cloud realtime inbox, cross-session read, retry, invitation and permission loss', async ({
  browser,
}) => {
  const clients: Record<string, SupabaseClient> = {},
    uids: Record<string, string> = {},
    contexts: BrowserContext[] = []
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    completed: false,
  }
  let workspace = '',
    memberRemoved = false,
    viewerJoined = false
  const board = randomUUID(),
    task = randomUUID(),
    title = 'QA G4 ' + task.slice(0, 8)
  async function rpc(
    role: string,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const { data, error } = await clients[role]!.rpc(name, args)
    if (error) throw Error(name + ': ' + error.code + ' ' + error.message)
    return data
  }
  async function open(role: string) {
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto('/login?redirect=/notifications')
    await page
      .getByLabel('Email', { exact: true })
      .fill(process.env['E2E_' + role.toUpperCase() + '_EMAIL']!)
    await page
      .getByLabel('Mật khẩu', { exact: true })
      .fill(process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Thông báo', exact: true }),
    ).toBeVisible()
    return page
  }
  try {
    for (const role of ['owner', 'member', 'viewer']) {
      const client = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
      clients[role] = client
      const { data, error } = await client.auth.signInWithPassword({
        email: process.env['E2E_' + role.toUpperCase() + '_EMAIL']!,
        password: process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!,
      })
      if (error || !data.user?.email_confirmed_at)
        throw Error('QA login failed: ' + role)
      uids[role] = data.user.id
    }
    // Do not alter existing personal preferences to make a test pass.
    const prefs = (await rpc('member', 'notification_feed')).preferences
    if (!prefs.assignments || !prefs.comments)
      throw Error(
        'QA Member disabled assignment/comment notifications; use enabled QA account',
      )
    workspace = await rpc('owner', 'workspace_create', {
      p_name: 'QA G4 notifications',
    })
    report.workspace = workspace
    const token = await rpc('owner', 'workspace_invite', {
      p_workspace: workspace,
      p_email: process.env.E2E_MEMBER_EMAIL,
      p_role: 'member',
    })
    await rpc('member', 'workspace_invitation_accept', { p_token: token })
    await rpc('owner', 'board_create', {
      p_workspace: workspace,
      p_id: board,
      p_name: 'QA G4 board',
    })
    const first = await open('member'),
      second = await open('member')
    const start = Date.now()
    await rpc('owner', 'board_mutate', {
      p_board: board,
      p_version: 1,
      p_mutation: randomUUID(),
      p_action: 'save_task',
      p_data: {
        id: task,
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        assignee_id: uids.member,
        due_date: '',
      },
    })
    await expect(
      first.getByRole('link', { name: title, exact: true }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      second.getByRole('link', { name: title, exact: true }),
    ).toBeVisible({ timeout: 10000 })
    report.assignmentRealtimeMs = Date.now() - start
    const firstRow = first
      .getByRole('listitem')
      .filter({ has: first.getByRole('link', { name: title, exact: true }) })
    const secondRow = second
      .getByRole('listitem')
      .filter({ has: second.getByRole('link', { name: title, exact: true }) })
    let lost = false
    await first.route('**/rest/v1/rpc/notification_mutate', async (route) => {
      if (lost) return route.continue()
      lost = true
      await route.fetch()
      await route.abort('connectionfailed')
    })
    await firstRow
      .getByRole('button', { name: 'Đánh dấu đã đọc', exact: true })
      .click()
    await first
      .getByRole('button', {
        name: 'Xác nhận lại thao tác thông báo',
        exact: true,
      })
      .click()
    await expect(
      secondRow.getByRole('button', { name: 'Đánh dấu chưa đọc', exact: true }),
    ).toBeVisible({ timeout: 10000 })
    let items = (await rpc('member', 'notification_feed')).items.filter(
      (n: any) => n.task_id === task,
    )
    expect(items).toHaveLength(1)
    expect(items[0].version).toBe(2)
    const c = randomUUID(),
      args = { p_board: board, p_task: task, p_id: c, p_body: 'G4 comment' }
    await rpc('owner', 'task_comment_add', args)
    await rpc('owner', 'task_comment_add', args)
    await expect(
      first.getByRole('link', { name: title, exact: true }),
    ).toHaveCount(2, { timeout: 10000 })
    items = (await rpc('member', 'notification_feed')).items.filter(
      (n: any) => n.task_id === task,
    )
    expect(items.filter((n: any) => n.kind === 'comment')).toHaveLength(1)
    expect(
      (await rpc('viewer', 'notification_feed')).items.some(
        (n: any) => n.task_id === task,
      ),
    ).toBe(false)
    const denied = await clients.viewer!.rpc('notification_mutate', {
      p_mutation: randomUUID(),
      p_action: 'read',
      p_data: { id: items[0].id, version: items[0].version, read: true },
    })
    expect(denied.error?.code).toBe('42501')
    const watch = await rpc('member', 'task_watch_get', { p_task: task })
    await rpc('member', 'notification_mutate', {
      p_mutation: randomUUID(),
      p_action: 'watch',
      p_data: { task, version: watch.version, enabled: false },
    })
    await rpc('owner', 'task_comment_add', {
      ...args,
      p_id: randomUUID(),
      p_body: 'Muted comment',
    })
    expect(
      (await rpc('member', 'notification_feed')).items.filter(
        (n: any) => n.task_id === task,
      ),
    ).toHaveLength(2)
    await rpc('owner', 'workspace_invite', {
      p_workspace: workspace,
      p_email: process.env.E2E_VIEWER_EMAIL,
      p_role: 'viewer',
    })
    const invited = (await rpc('viewer', 'notification_feed')).items.find(
      (n: any) => n.workspace_id === workspace && n.kind === 'invitation',
    )
    expect(invited).toBeTruthy()
    const wrong = await clients.member!.rpc('notification_invitation_accept', {
      p_invitation: invited.invitation_id,
    })
    expect(wrong.error?.code).toBe('42501')
    await rpc('viewer', 'notification_invitation_accept', {
      p_invitation: invited.invitation_id,
    })
    viewerJoined = true
    await rpc('viewer', 'notification_invitation_accept', {
      p_invitation: invited.invitation_id,
    })
    expect(
      await rpc('viewer', 'workspace_role', { p_workspace: workspace }),
    ).toBe('viewer')
    await rpc('owner', 'workspace_member_remove', {
      p_workspace: workspace,
      p_user: uids.member,
    })
    memberRemoved = true
    await expect(
      first.getByRole('link', { name: title, exact: true }),
    ).toHaveCount(0, { timeout: 10000 })
    await expect(
      second.getByRole('link', { name: title, exact: true }),
    ).toHaveCount(0, { timeout: 10000 })
    report.completed = true
  } finally {
    try {
      if (workspace) {
        if (!memberRemoved)
          await rpc('owner', 'workspace_member_remove', {
            p_workspace: workspace,
            p_user: uids.member,
          })
        if (viewerJoined)
          await rpc('owner', 'workspace_member_remove', {
            p_workspace: workspace,
            p_user: uids.viewer,
          })
        const w = await rpc('owner', 'workspace_settings_get', {
          p_workspace: workspace,
        })
        await rpc('owner', 'workspace_mutate', {
          p_workspace: workspace,
          p_version: w.version,
          p_mutation: randomUUID(),
          p_action: 'archive',
          p_data: {},
        })
      }
      report.cleanup =
        'QA memberships removed; QA workspace archived; preferences unchanged'
    } catch {
      report.cleanup = 'Incomplete: inspect QA workspace'
    }
    for (const context of contexts) await context.close()
    for (const client of Object.values(clients)) {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }
    report.finishedAt = new Date().toISOString()
    mkdirSync('output/playwright', { recursive: true })
    writeFileSync(
      'output/playwright/g4-cloud-verification.json',
      JSON.stringify(report, null, 2),
    )
  }
})
