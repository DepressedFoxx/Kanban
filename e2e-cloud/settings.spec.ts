import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

test('G1 cloud: settings conflict, archive realtime, ownership transfer and leave receipt', async ({
  browser,
}) => {
  const clients: Record<string, SupabaseClient> = {},
    uids: Record<string, string> = {},
    contexts: BrowserContext[] = []
  const checks: string[] = []
  let workspace = '',
    board = '',
    currentOwner = 'owner'
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    checks,
  }
  async function call(
    role: string,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const { data, error } = await clients[role]!.rpc(name, args)
    if (error) throw new Error(`${name}: ${error.code} ${error.message}`)
    return data
  }
  async function snapshot(role = currentOwner) {
    return call(role, 'workspace_settings_get', { p_workspace: workspace })
  }
  async function mutation(
    role: string,
    action: string,
    data: Record<string, unknown> = {},
  ) {
    const s = await snapshot(role)
    return call(role, 'workspace_mutate', {
      p_workspace: workspace,
      p_version: s.version,
      p_mutation: randomUUID(),
      p_action: action,
      p_data: data,
    })
  }
  async function open(role: string, path: string) {
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:5190/login?redirect=${path}`)
    await page
      .getByLabel('Email', { exact: true })
      .fill(process.env[`E2E_${role.toUpperCase()}_EMAIL`]!)
    await page
      .getByLabel('Mật khẩu', { exact: true })
      .fill(process.env[`E2E_${role.toUpperCase()}_PASSWORD`]!)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(`http://127.0.0.1:5190${path}`)
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
        email: process.env[`E2E_${role.toUpperCase()}_EMAIL`]!,
        password: process.env[`E2E_${role.toUpperCase()}_PASSWORD`]!,
      })
      if (error || !data.user?.email_confirmed_at)
        throw Error(`QA ${role} login failed`)
      uids[role] = data.user.id
    }
    workspace = await call('owner', 'workspace_create', {
      p_name: 'QA G1 lifecycle',
    })
    report.workspace = workspace
    for (const role of ['member', 'viewer']) {
      const token = await call('owner', 'workspace_invite', {
        p_workspace: workspace,
        p_email: process.env[`E2E_${role.toUpperCase()}_EMAIL`],
        p_role: role,
      })
      await call(role, 'workspace_invitation_accept', { p_token: token })
    }
    board = randomUUID()
    await call('member', 'board_create', {
      p_workspace: workspace,
      p_id: board,
      p_name: 'QA G1 board',
    })
    expect(
      await call('member', 'board_create', {
        p_workspace: workspace,
        p_id: board,
        p_name: 'QA G1 board',
      }),
    ).toBe(board)
    const viewerCreate = await clients.viewer!.rpc('board_create', {
      p_workspace: workspace,
      p_id: randomUUID(),
      p_name: 'Denied viewer board',
    })
    expect(viewerCreate.error?.code).toBe('42501')
    const memberBoards = await open('member', `/workspaces/${workspace}/boards`)
    await expect(
      memberBoards.getByLabel('Tên board mới', { exact: true }),
    ).toBeVisible()
    await memberBoards.close()
    checks.push(
      'G6 Member can create/retry board and sees creation form; Viewer RPC denied',
    )
    const task = randomUUID()
    await call('member', 'board_mutate', {
      p_board: board,
      p_version: 1,
      p_mutation: randomUUID(),
      p_action: 'save_task',
      p_data: {
        id: task,
        title: 'Assigned G1',
        description: '',
        status: 'todo',
        priority: 'medium',
        assignee_id: uids.viewer,
        due_date: '2026-10-01',
      },
    })
    const settings = await open('owner', `/workspaces/${workspace}/settings`),
      memberPage = await open('member', `/boards/${board}`)
    await expect(
      memberPage.getByText('Cập nhật trực tiếp đang bật', { exact: true }),
    ).toBeVisible()
    await settings
      .getByLabel('Mô tả', { exact: true })
      .fill('Cloud settings confirmed')
    await settings
      .getByRole('button', { name: 'Lưu cài đặt', exact: true })
      .click()
    await expect(
      settings.getByRole('status').filter({ hasText: 'Đã xác nhận' }),
    ).toBeVisible()
    expect((await snapshot()).description).toBe('Cloud settings confirmed')
    const denied = await clients.member!.rpc('workspace_mutate', {
      p_workspace: workspace,
      p_version: (await snapshot()).version,
      p_mutation: randomUUID(),
      p_action: 'archive',
      p_data: {},
    })
    expect(denied.error?.code).toBe('42501')
    const stale = await snapshot()
    const concurrent = await Promise.all(
      [1, 2].map((i) =>
        clients.owner!.rpc('workspace_mutate', {
          p_workspace: workspace,
          p_version: stale.version,
          p_mutation: randomUUID(),
          p_action: 'update',
          p_data: {
            name: 'QA G1 lifecycle',
            description: `Concurrent ${i}`,
            timezone: 'Asia/Bangkok',
          },
        }),
      ),
    )
    expect(concurrent.filter((r) => !r.error)).toHaveLength(1)
    expect(concurrent.find((r) => r.error)?.error?.code).toBe('PT409')
    checks.push(
      'Settings UI save, role denial and two connections conflict safely',
    )
    const beforeArchive = await snapshot()
    const archiveRace = await Promise.all([
      clients.owner!.rpc('workspace_mutate', {
        p_workspace: workspace,
        p_version: beforeArchive.version,
        p_mutation: randomUUID(),
        p_action: 'archive',
        p_data: {},
      }),
      clients.member!.rpc('task_comment_add', {
        p_board: board,
        p_task: task,
        p_id: randomUUID(),
        p_body: 'G6 archive race',
      }),
    ])
    expect(archiveRace[0]!.error).toBeNull()
    if (archiveRace[1]!.error)
      expect(archiveRace[1]!.error.message).toBe('WORKSPACE_ARCHIVED')
    expect((await snapshot()).archived_at).toBeTruthy()
    checks.push(
      'G6 archive-vs-comment race serialized; post-archive write denied below',
    )
    await expect(
      memberPage.getByText('Workspace đã lưu trữ, nội dung chỉ đọc.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      memberPage.getByRole('button', { name: 'Tạo công việc', exact: true }),
    ).not.toBeVisible()
    const blocked = await clients.member!.rpc('task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: randomUUID(),
      p_body: 'Denied archived',
    })
    expect(blocked.error?.message).toBe('WORKSPACE_ARCHIVED')
    await mutation('owner', 'restore')
    await expect(
      memberPage.getByRole('button', { name: 'Tạo công việc', exact: true }),
    ).toBeEnabled({ timeout: 10000 })
    checks.push(
      'Archive/restore invalidates active board UI; legacy comment RPC blocked while archived',
    )
    // Lose the real committed transfer response, then retry through the UI with old Owner now Member.
    await settings.getByRole('button', { name: 'Tải lại', exact: true }).click()
    await expect(
      settings.getByRole('button', { name: 'Chuyển Owner', exact: true }),
    ).toBeEnabled()
    await settings
      .getByRole('button', { name: 'Chuyển Owner', exact: true })
      .click()
    await settings.getByRole('combobox', { name: 'Owner mới' }).click()
    const people = await call('owner', 'workspace_member_list', {
      p_workspace: workspace,
    })
    const target = people.find((p: any) => p.user_id === uids.member)
    await settings
      .getByRole('option', {
        name: target.display_name || target.email,
        exact: true,
      })
      .click()
    const requests: unknown[] = []
    await settings.route('**/rest/v1/rpc/workspace_mutate', async (route) => {
      requests.push(route.request().postDataJSON())
      if (requests.length === 1) {
        const response = await route.fetch()
        expect(response.ok()).toBeTruthy()
        await route.abort('failed')
      } else await route.continue()
    })
    await settings
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Xác nhận', exact: true })
      .click()
    currentOwner = 'member'
    await settings
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Xác nhận lại thao tác', exact: true })
      .click()
    await expect(
      settings.getByRole('button', { name: 'Rời workspace', exact: true }),
    ).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[0]).toEqual(requests[1])
    await settings.unroute('**/rest/v1/rpc/workspace_mutate')
    expect((await snapshot('member')).owner_id).toBe(uids.member)
    const viewerState = await snapshot('viewer'),
      leaveId = randomUUID(),
      leaveArgs = {
        p_workspace: workspace,
        p_version: viewerState.version,
        p_mutation: leaveId,
        p_action: 'leave',
        p_data: {},
      }
    await call('viewer', 'workspace_mutate', leaveArgs)
    expect(await call('viewer', 'workspace_mutate', leaveArgs)).toEqual({
      ok: true,
      mutation_id: leaveId,
    })
    expect(
      (
        await clients.viewer!.rpc('workspace_settings_get', {
          p_workspace: workspace,
        })
      ).error?.code,
    ).toBe('42501')
    const boardState = await call('member', 'board_snapshot', {
      p_board: board,
    })
    expect(boardState.tasks[0].assignee_id).toBeNull()
    checks.push(
      'Lost transfer response retries same receipt after demotion; leave ACK after revoked access; assignment cleared',
    )
    const audit = await call('member', 'workspace_activity_list', {
      p_workspace: workspace,
    })
    expect(audit.filter((a: any) => a.action === 'transfer')).toHaveLength(1)
    checks.push('One transfer audit event; Owner identity consistent')
    report.completed = true
  } finally {
    if (workspace) {
      try {
        if (currentOwner !== 'owner') {
          await mutation(currentOwner, 'transfer', { user_id: uids.owner })
          currentOwner = 'owner'
        }
        for (const role of ['member', 'viewer']) {
          const people = await call('owner', 'workspace_member_list', {
            p_workspace: workspace,
          })
          if (people.some((p: any) => p.user_id === uids[role]))
            await call('owner', 'workspace_member_remove', {
              p_workspace: workspace,
              p_user: uids[role],
            })
        }
        if (!(await snapshot()).archived_at) await mutation('owner', 'archive')
        report.cleanup =
          'QA workspace archived, test memberships removed, initial Owner restored'
      } catch {
        report.cleanup = 'Incomplete; inspect QA workspace ID'
      }
    }
    for (const context of contexts) await context.close()
    for (const client of Object.values(clients)) {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }
    report.finishedAt = new Date().toISOString()
    mkdirSync('output/playwright', { recursive: true })
    writeFileSync(
      'output/playwright/g1-cloud-verification.json',
      JSON.stringify(report, null, 2),
    )
  }
})
