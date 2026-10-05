import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
test('G3 cloud assignee scope, realtime, preset concurrency and revocation', async ({
  browser,
}) => {
  const clients: Record<string, SupabaseClient> = {},
    uids: Record<string, string> = {}
  const contexts: BrowserContext[] = []
  let workspace = '',
    removed = false,
    preset = ''
  const board = randomUUID(),
    task = randomUUID()
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    completed: false,
  }
  async function rpc(
    role: string,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const { data, error } = await clients[role]!.rpc(name, args)
    if (error) throw Error(name + ': ' + error.code + ' ' + error.message)
    return data
  }
  async function mutate(data: Record<string, unknown>) {
    const s = await rpc('owner', 'board_snapshot', { p_board: board })
    return rpc('owner', 'board_mutate', {
      p_board: board,
      p_version: s.board.version,
      p_mutation: randomUUID(),
      p_action: 'save_task',
      p_data: data,
    })
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
    workspace = await rpc('owner', 'workspace_create', {
      p_name: 'QA G3 My Tasks',
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
      p_name: 'QA G3 board',
    })
    const data = {
      id: task,
      title: 'G3 assigned task',
      description: 'Cloud query',
      status: 'todo',
      priority: 'high',
      assignee_id: uids.member,
      due_date: '',
    }
    await mutate(data)
    expect(
      (await rpc('member', 'my_tasks_query', { p_filters: { workspace } }))
        .total,
    ).toBe(1)
    expect(
      (await rpc('owner', 'my_tasks_query', { p_filters: { workspace } }))
        .total,
    ).toBe(0)
    expect(
      (await rpc('viewer', 'my_tasks_query', { p_filters: { workspace } }))
        .total,
    ).toBe(0)
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(
      '/login?redirect=' +
        encodeURIComponent('/my-tasks?workspace=' + workspace),
    )
    await page
      .getByLabel('Email', { exact: true })
      .fill(process.env.E2E_MEMBER_EMAIL!)
    await page
      .getByLabel('Mật khẩu', { exact: true })
      .fill(process.env.E2E_MEMBER_PASSWORD!)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(
      page.getByRole('link', { name: data.title, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Cập nhật trực tiếp đang bật', { exact: false }).first(),
    ).toBeVisible()
    await page.getByLabel('Tìm tên hoặc mô tả').fill('Draft stays')
    const started = Date.now()
    await mutate({ ...data, title: 'G3 realtime updated' })
    await expect(
      page.getByRole('link', { name: 'G3 realtime updated', exact: true }),
    ).toBeVisible({ timeout: 10000 })
    report.realtimeMs = Date.now() - started
    await expect(page.getByLabel('Tìm tên hoặc mô tả')).toHaveValue(
      'Draft stays',
    )
    preset = randomUUID()
    const args = {
      p_id: preset,
      p_version: 0,
      p_mutation: randomUUID(),
      p_action: 'save',
      p_name: 'QA G3 ' + preset.slice(0, 8),
      p_filters: { workspace },
    }
    await rpc('member', 'task_saved_filter_mutate', args)
    expect(
      (await rpc('viewer', 'my_tasks_query')).saved.some(
        (s: any) => s.id === preset,
      ),
    ).toBe(false)
    const races = await Promise.all(
      [1, 2].map((n) =>
        clients.member!.rpc('task_saved_filter_mutate', {
          ...args,
          p_version: 1,
          p_mutation: randomUUID(),
          p_name: args.p_name + ' ' + n,
        }),
      ),
    )
    expect(races.filter((r) => !r.error)).toHaveLength(1)
    expect(races.find((r) => r.error)?.error?.code).toBe('PT409')
    const stolen = await clients.viewer!.rpc('task_saved_filter_mutate', {
      ...args,
      p_version: 2,
      p_mutation: randomUUID(),
    })
    expect(stolen.error?.code).toBe('42501')
    const direct = await clients
      .viewer!.from('task_saved_filters')
      .select('id')
      .eq('id', preset)
    expect(direct.error).toBeNull()
    expect(direct.data).toEqual([])
    await page.getByLabel('Tìm tên hoặc mô tả').fill('')
    await mutate({ ...data, title: 'G3 realtime updated', status: 'done' })
    await expect(
      page.getByRole('link', { name: 'G3 realtime updated', exact: true }),
    ).not.toBeVisible({ timeout: 10000 })
    await page
      .getByRole('button', { name: 'Đã hoàn thành', exact: true })
      .click()
    await expect(
      page.getByRole('link', { name: 'G3 realtime updated', exact: true }),
    ).toBeVisible()
    await mutate({
      ...data,
      title: 'G3 realtime updated',
      status: 'done',
      assignee_id: uids.owner,
    })
    await expect(
      page.getByRole('link', { name: 'G3 realtime updated', exact: true }),
    ).not.toBeVisible({ timeout: 10000 })
    await mutate({ ...data, title: 'G3 realtime updated' })
    await page.getByRole('button', { name: 'Đang mở', exact: true }).click()
    await expect(
      page.getByRole('link', { name: 'G3 realtime updated', exact: true }),
    ).toBeVisible()
    await rpc('owner', 'workspace_member_remove', {
      p_workspace: workspace,
      p_user: uids.member,
    })
    removed = true
    await page
      .getByRole('button', { name: 'Tải lại danh sách', exact: true })
      .click()
    await expect(
      page.getByRole('link', { name: 'G3 realtime updated', exact: true }),
    ).not.toBeVisible()
    expect(
      (await rpc('member', 'my_tasks_query', { p_filters: { workspace } }))
        .total,
    ).toBe(0)
    report.completed = true
  } finally {
    try {
      if (preset) {
        const saved = (await rpc('member', 'my_tasks_query')).saved.find(
          (s: any) => s.id === preset,
        )
        if (saved)
          await rpc('member', 'task_saved_filter_mutate', {
            p_id: preset,
            p_version: saved.version,
            p_mutation: randomUUID(),
            p_action: 'delete',
          })
      }
      if (workspace) {
        if (!removed)
          await rpc('owner', 'workspace_member_remove', {
            p_workspace: workspace,
            p_user: uids.member,
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
        'QA preset deleted; member removed; QA workspace archived'
    } catch {
      report.cleanup = 'Incomplete: inspect QA workspace/preset'
    }
    for (const context of contexts) await context.close()
    for (const client of Object.values(clients)) {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }
    report.finishedAt = new Date().toISOString()
    mkdirSync('output/playwright', { recursive: true })
    writeFileSync(
      'output/playwright/g3-cloud-verification.json',
      JSON.stringify(report, null, 2),
    )
  }
})
