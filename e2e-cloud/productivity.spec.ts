import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
test('G2 cloud: concurrent checklist, label scope, realtime edited/deleted comments and retry', async ({
  browser,
}) => {
  const clients: Record<string, SupabaseClient> = {},
    uids: Record<string, string> = {},
    contexts: BrowserContext[] = []
  let workspace = '',
    board = ''
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    completed: false,
  }
  async function call(
    role: string,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const { data, error } = await clients[role]!.rpc(name, args)
    if (error) throw Error(name + ': ' + error.code + ' ' + error.message)
    return data
  }
  const snapshot = () => call('owner', 'board_snapshot', { p_board: board })
  async function mutate(
    role: string,
    action: string,
    data: Record<string, unknown>,
  ) {
    return call(role, 'board_mutate', {
      p_board: board,
      p_version: (await snapshot()).board.version,
      p_mutation: randomUUID(),
      p_action: action,
      p_data: data,
    })
  }
  async function open(role: string, task: string) {
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(
      '/login?redirect=' +
        encodeURIComponent('/boards/' + board + '?task=' + task),
    )
    await page
      .getByLabel('Email', { exact: true })
      .fill(process.env['E2E_' + role.toUpperCase() + '_EMAIL']!)
    await page
      .getByLabel('Mật khẩu', { exact: true })
      .fill(process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .getByRole('button', { name: 'Bình luận & lịch sử', exact: true })
      .click()
    await expect(
      page.getByText('Cập nhật trực tiếp đang bật', { exact: true }).first(),
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
        throw Error('QA ' + role + ' login failed')
      uids[role] = data.user.id
    }
    workspace = await call('owner', 'workspace_create', {
      p_name: 'QA G2 productivity',
    })
    report.workspace = workspace
    for (const role of ['member', 'viewer']) {
      const token = await call('owner', 'workspace_invite', {
        p_workspace: workspace,
        p_email: process.env['E2E_' + role.toUpperCase() + '_EMAIL'],
        p_role: role,
      })
      await call(role, 'workspace_invitation_accept', { p_token: token })
    }
    board = randomUUID()
    const task = randomUUID(),
      label = randomUUID(),
      item = randomUUID()
    await call('owner', 'board_create', {
      p_workspace: workspace,
      p_id: board,
      p_name: 'QA G2 board',
    })
    await mutate('member', 'save_task', {
      id: task,
      title: 'G2 Task',
      description: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: null,
      due_date: '',
    })
    await mutate('owner', 'label_save', {
      id: label,
      name: 'Cloud label',
      color: 'purple',
    })
    const version = (await snapshot()).board.version
    const args = {
      p_board: board,
      p_version: version,
      p_action: 'task_details',
      p_data: {
        id: task,
        label_ids: [label],
        items: [{ id: item, body: 'Concurrent', done: false }],
      },
    }
    const races = await Promise.all(
      ['owner', 'member'].map((role) =>
        clients[role]!.rpc('board_mutate', {
          ...args,
          p_mutation: randomUUID(),
        }),
      ),
    )
    expect(races.filter((r) => !r.error)).toHaveLength(1)
    expect(races.find((r) => r.error)?.error?.code).toBe('PT409')
    expect(
      (
        await clients.viewer!.rpc('board_mutate', {
          ...args,
          p_version: (await snapshot()).board.version,
          p_mutation: randomUUID(),
        })
      ).error?.code,
    ).toBe('42501')
    const ownerPage = await open('owner', task),
      memberPage = await open('member', task)
    await memberPage.getByLabel('Bình luận mới').fill('G2 initial')
    await memberPage
      .getByRole('button', { name: 'Gửi bình luận', exact: true })
      .click()
    await expect(
      ownerPage.getByText('G2 initial', { exact: true }),
    ).toBeVisible()
    await ownerPage.getByLabel('Bình luận mới').fill('Owner draft stays')
    await memberPage
      .getByRole('button', { name: 'Sửa bình luận', exact: true })
      .click()
    await memberPage.getByLabel('Nội dung chỉnh sửa').fill('G2 edited')
    let lost = false
    await memberPage.route(
      '**/rest/v1/rpc/task_comment_mutate',
      async (route) => {
        if (!lost) {
          lost = true
          await route.fetch()
          await route.abort('connectionreset')
        } else await route.continue()
      },
    )
    await memberPage
      .getByRole('button', { name: 'Lưu bình luận', exact: true })
      .click()
    await memberPage
      .getByRole('button', { name: 'Xác nhận lại bình luận', exact: true })
      .click()
    await expect(
      ownerPage.getByText('G2 edited', { exact: true }),
    ).toBeVisible()
    await expect(ownerPage.getByLabel('Bình luận mới')).toHaveValue(
      'Owner draft stays',
    )
    await ownerPage
      .getByRole('button', { name: 'Xóa bình luận', exact: true })
      .click()
    await expect(
      ownerPage
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Xóa bình luận', exact: true }),
    ).toBeDisabled()
    await ownerPage.getByLabel('Lý do xóa (bắt buộc)').fill('QA moderation')
    await ownerPage
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Xóa bình luận', exact: true })
      .click()
    await expect(
      memberPage.getByText('Bình luận đã được xóa.', { exact: true }),
    ).toBeVisible()
    const thread = await call('member', 'task_thread', {
      p_board: board,
      p_task: task,
    })
    expect(thread.comments).toHaveLength(1)
    expect(thread.comments[0].version).toBe(3)
    expect(thread.comments[0].body).toBeNull()
    const copy = randomUUID()
    await mutate('member', 'duplicate_task', { id: task, new_id: copy })
    expect(
      (await call('member', 'task_thread', { p_board: board, p_task: copy }))
        .comments,
    ).toHaveLength(0)
    await mutate('member', 'bulk_status', { ids: [task, copy], status: 'done' })
    await mutate('owner', 'label_delete', { id: label })
    const final = await snapshot()
    expect(final.tasks).toHaveLength(2)
    expect(
      final.tasks.every(
        (t: any) => t.status === 'done' && t.label_ids.length === 0,
      ),
    ).toBe(true)
    report.completed = true
    report.checks = [
      'One concurrent checklist succeeds, other PT409',
      'Viewer denied',
      'Realtime comment edit/delete preserves other draft',
      'Lost edit response retries once, version increments once',
      'Owner moderation requires reason',
      'Duplicate excludes comments, bulk and label delete preserve tasks',
    ]
  } finally {
    if (workspace)
      try {
        for (const role of ['member', 'viewer'])
          await call('owner', 'workspace_member_remove', {
            p_workspace: workspace,
            p_user: uids[role],
          })
        const w = await call('owner', 'workspace_settings_get', {
          p_workspace: workspace,
        })
        await call('owner', 'workspace_mutate', {
          p_workspace: workspace,
          p_version: w.version,
          p_mutation: randomUUID(),
          p_action: 'archive',
          p_data: {},
        })
        report.cleanup = 'QA workspace archived; Member/Viewer removed'
      } catch {
        report.cleanup = 'Incomplete; inspect QA workspace'
      }
    for (const context of contexts) await context.close()
    for (const client of Object.values(clients)) {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }
    report.finishedAt = new Date().toISOString()
    mkdirSync('output/playwright', { recursive: true })
    writeFileSync(
      'output/playwright/g2-cloud-verification.json',
      JSON.stringify(report, null, 2),
    )
  }
})
