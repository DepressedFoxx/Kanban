import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

test('real Supabase roles, competing writes, browser realtime and five-session benchmark', async ({
  browser,
}) => {
  const report: Record<string, any> = {
    startedAt: new Date().toISOString(),
    scope: 'localhost frontend + real Supabase',
    checks: [],
    benchmark: [],
  }
  const clients: Record<string, SupabaseClient> = {}
  const identities: Record<string, string> = {}
  const contexts: BrowserContext[] = []
  let workspace = '',
    board = randomUUID(),
    version = 1
  const checks = report.checks as string[]
  const call = async (
    role: string,
    name: string,
    args: Record<string, unknown> = {},
  ) => {
    const result = await clients[role]!.rpc(name, args)
    if (result.error) throw new Error(`${role}/${name}: ${result.error.code}`)
    return result.data
  }
  const denied = async (
    role: string,
    name: string,
    args: Record<string, unknown>,
  ) => {
    const result = await clients[role]!.rpc(name, args)
    expect(result.error?.code, `${role}/${name} must deny`).toBe('42501')
  }
  const snapshot = () => call('owner', 'board_snapshot', { p_board: board })
  const write = async (
    action: string,
    data: Record<string, unknown>,
    role = 'owner',
  ) => {
    const latest = await snapshot()
    const result = await call(role, 'board_mutate', {
      p_board: board,
      p_version: latest.board.version,
      p_mutation: randomUUID(),
      p_action: action,
      p_data: data,
    })
    version = result.board.version
    return result
  }
  const invite = async (role: string) => {
    const token = await call('owner', 'workspace_invite', {
      p_workspace: workspace,
      p_email: process.env[`E2E_${role.toUpperCase()}_EMAIL`],
      p_role: role,
    })
    await call(role, 'workspace_invitation_accept', { p_token: token })
    return token
  }
  const open = async (role: string) => {
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:5190/login?redirect=/boards/${board}`)
    await page
      .getByLabel('Email', { exact: true })
      .fill(process.env[`E2E_${role.toUpperCase()}_EMAIL`]!)
    await page
      .getByLabel('Mật khẩu', { exact: true })
      .fill(process.env[`E2E_${role.toUpperCase()}_PASSWORD`]!)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(`http://127.0.0.1:5190/boards/${board}`)
    await expect(
      page.getByText('Cập nhật trực tiếp đang bật', { exact: true }),
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
      const result = await client.auth.signInWithPassword({
        email: process.env[`E2E_${role.toUpperCase()}_EMAIL`]!,
        password: process.env[`E2E_${role.toUpperCase()}_PASSWORD`]!,
      })
      if (result.error || !result.data.user?.email_confirmed_at)
        throw new Error(`${role}: login failed or email not confirmed`)
      identities[role] = result.data.user.id
    }
    checks.push('Three separate verified accounts authenticated')
    workspace = await call('owner', 'workspace_create', {
      p_name: `QA MVP ${new Date().toISOString().slice(0, 16)}`,
    })
    report.workspace = workspace
    report.board = board
    await call('owner', 'board_create', {
      p_workspace: workspace,
      p_id: board,
      p_name: 'QA MVP — 100 tasks / 5 sessions',
    })
    await denied('viewer', 'board_snapshot', { p_board: board })
    const outsideRead = await clients
      .viewer!.from('boards')
      .select('id')
      .eq('id', board)
    expect(outsideRead.error).toBeNull()
    expect(outsideRead.data).toEqual([])
    checks.push(
      'Outsider before invitation cannot read RPC or direct RLS table',
    )
    const token = await call('owner', 'workspace_invite', {
      p_workspace: workspace,
      p_email: process.env.E2E_MEMBER_EMAIL,
      p_role: 'member',
    })
    const wrongEmail = await clients.viewer!.rpc(
      'workspace_invitation_accept',
      { p_token: token },
    )
    expect(wrongEmail.error).not.toBeNull()
    await call('member', 'workspace_invitation_preview', { p_token: token })
    await call('member', 'workspace_invitation_accept', { p_token: token })
    await call('member', 'workspace_invitation_accept', { p_token: token })
    const revokedToken = await call('owner', 'workspace_invite', {
      p_workspace: workspace,
      p_email: process.env.E2E_VIEWER_EMAIL,
      p_role: 'viewer',
    })
    const invitations = await call('owner', 'workspace_invitation_list', {
      p_workspace: workspace,
    })
    const pending = invitations.find(
      (i: any) =>
        i.email === process.env.E2E_VIEWER_EMAIL &&
        !i.revoked_at &&
        !i.accepted_at,
    )
    await call('owner', 'workspace_invitation_revoke', {
      p_workspace: workspace,
      p_invitation: pending.id,
    })
    expect(
      (
        await clients.viewer!.rpc('workspace_invitation_accept', {
          p_token: revokedToken,
        })
      ).error,
    ).not.toBeNull()
    await invite('viewer')
    checks.push(
      'Invitation preview, matching email, wrong email, repeat acceptance and revoked link',
    )
    await denied('member', 'workspace_rename', {
      p_workspace: workspace,
      p_name: 'Forbidden',
    })
    await denied('viewer', 'board_mutate', {
      p_board: board,
      p_version: 1,
      p_mutation: randomUUID(),
      p_action: 'rename',
      p_data: { name: 'Forbidden' },
    })
    expect(
      (
        await clients
          .member!.from('boards')
          .update({ name: 'Forbidden' })
          .eq('id', board)
      ).error,
    ).not.toBeNull()
    checks.push(
      'Member cannot manage workspace; Viewer cannot write; direct table write denied',
    )
    const task = randomUUID()
    const input = {
      id: task,
      title: 'QA benchmark 000',
      description: 'Isolated acceptance dataset',
      status: 'todo',
      priority: 'medium',
      assignee_id: identities.member,
      due_date: '',
    }
    await write('save_task', input, 'member')
    await denied('viewer', 'task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: randomUUID(),
      p_body: 'Forbidden',
    })
    const commentId = randomUUID()
    await call('member', 'task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: commentId,
      p_body: 'QA acceptance comment',
    })
    const thread = await call('member', 'task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: commentId,
      p_body: 'QA acceptance comment',
    })
    expect(thread.comments.filter((c: any) => c.id === commentId)).toHaveLength(
      1,
    )
    expect(thread.comments.find((c: any) => c.id === commentId).actor_id).toBe(
      identities.member,
    )
    checks.push(
      'Member task/comment writes and comment receipt with correct server actor',
    )
    const base = await snapshot()
    const concurrent = await Promise.all(
      ['owner', 'member'].map((role) =>
        clients[role]!.rpc('board_mutate', {
          p_board: board,
          p_version: base.board.version,
          p_mutation: randomUUID(),
          p_action: 'save_task',
          p_data: { ...input, title: `Concurrent ${role}` },
        }),
      ),
    )
    report.concurrent = concurrent.map((r) => ({
      status: r.status,
      code: r.error?.code,
      message: r.error?.message,
    }))
    console.log('Concurrency diagnostic', JSON.stringify(report.concurrent))
    expect(concurrent.filter((r) => !r.error)).toHaveLength(1)
    expect(concurrent.find((r) => r.error)?.error?.code).toBe('PT409')
    checks.push(
      'Concurrent writes: one atomic success and one version conflict',
    )
    await write('save_task', input)
    for (let i = 1; i < 100; i++)
      await write('save_task', {
        ...input,
        id: randomUUID(),
        title: `QA benchmark ${String(i).padStart(3, '0')}`,
        assignee_id: null,
      })
    expect((await snapshot()).tasks).toHaveLength(100)
    const pages: Page[] = []
    for (const role of ['owner', 'member', 'viewer', 'owner', 'member'])
      pages.push(await open(role))
    await expect(
      pages[2]!.getByRole('button', { name: 'Tạo công việc', exact: true }),
    ).not.toBeVisible()
    for (const page of pages)
      await expect(page.locator('.task-card')).toHaveCount(100)
    checks.push(
      'Five isolated authenticated browser sessions render 100 tasks; Viewer UI read-only',
    )
    for (let trial = 0; trial < 5; trial++) {
      const title = `QA measured change ${trial}`
      const latest = await snapshot()
      const start = performance.now()
      const waits = pages.map((page) =>
        page
          .getByRole('button', { name: title, exact: true })
          .waitFor({ state: 'visible', timeout: 10000 })
          .then(() => Math.round(performance.now() - start)),
      )
      await call('member', 'board_mutate', {
        p_board: board,
        p_version: latest.board.version,
        p_mutation: randomUUID(),
        p_action: 'save_task',
        p_data: { ...input, title },
      })
      report.benchmark.push({
        trial: trial + 1,
        millisecondsFromRequestStart: await Promise.all(waits),
      })
    }
    report.benchmarkUnder2s = report.benchmark.every((r: any) =>
      r.millisecondsFromRequestStart.every((ms: number) => ms <= 2000),
    )
    checks.push(
      'Realtime measured with 100 tasks and 5 sessions (see measurements; includes request latency)',
    )
    const ownerPage = pages[0]!,
      memberPage = pages[1]!
    // Both clients keep the same task open; no manual refresh or navigation.
    for (const page of [ownerPage, memberPage, pages[2]!]) {
      await page
        .getByRole('button', { name: 'QA measured change 4', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Bình luận & lịch sử', exact: true })
        .click()
      await expect(
        page.getByText('QA acceptance comment', { exact: true }),
      ).toBeVisible()
    }
    const ownerDialog = ownerPage.getByRole('dialog')
    const memberDialog = memberPage.getByRole('dialog')
    await expect(ownerDialog).toHaveAccessibleName(/công việc/i)
    await expect(
      ownerDialog.getByRole('textbox', { name: 'Bình luận mới', exact: true }),
    ).toBeVisible()
    await expect(
      pages[2]!.getByRole('textbox', { name: 'Bình luận mới', exact: true }),
    ).not.toBeVisible()
    await ownerPage
      .getByLabel('Bình luận mới', { exact: true })
      .fill('Owner unsent comment draft')
    await ownerPage.getByLabel('Bình luận mới', { exact: true }).focus()
    const startedComment = performance.now()
    await memberPage
      .getByLabel('Bình luận mới', { exact: true })
      .fill('Realtime comment from Member')
    await memberDialog
      .getByRole('button', { name: 'Gửi bình luận', exact: true })
      .click()
    for (const page of [ownerPage, memberPage, pages[2]!]) {
      await expect(
        page.getByText('Realtime comment from Member', { exact: true }),
      ).toHaveCount(1, { timeout: 5000 })
    }
    report.commentRealtimeMs = Math.round(performance.now() - startedComment)
    await expect(
      ownerPage.getByLabel('Bình luận mới', { exact: true }),
    ).toHaveValue('Owner unsent comment draft')
    await expect(
      ownerPage.getByLabel('Bình luận mới', { exact: true }),
    ).toBeFocused()
    await expect(
      memberPage.getByLabel('Bình luận mới', { exact: true }),
    ).toHaveValue('')
    const accessibleThread = await ownerDialog.ariaSnapshot()
    expect(accessibleThread).toContain('Realtime comment from Member')
    expect(accessibleThread).toContain('Thảo luận và lịch sử')
    await ownerDialog
      .getByRole('button', { name: 'Gửi bình luận', exact: true })
      .click()
    await expect(
      memberPage.getByText('Owner unsent comment draft', { exact: true }),
    ).toHaveCount(1, { timeout: 5000 })
    await expect(
      ownerPage.getByLabel('Bình luận mới', { exact: true }),
    ).toHaveValue('')
    for (const page of [ownerPage, memberPage, pages[2]!])
      await page.keyboard.press('Escape')
    await expect(
      ownerPage.getByRole('button', {
        name: 'QA measured change 4',
        exact: true,
      }),
    ).toBeFocused()
    checks.push(
      'Real UI comments synchronize Member-to-Owner/Viewer and Owner-to-Member within 5s without reload or duplicates; incoming comment preserves draft and focus',
    )
    checks.push(
      'Browser accessibility tree exposes named task dialog, comment textbox, discussion region and incoming text; Escape restores trigger focus (not a native screen-reader test)',
    )
    await ownerPage
      .getByRole('button', { name: 'QA measured change 4', exact: true })
      .click()
    await ownerPage
      .getByLabel('Tên công việc', { exact: true })
      .fill('Unsaved owner draft')
    await write(
      'save_task',
      { ...input, title: 'Incoming member update' },
      'member',
    )
    await expect(
      ownerPage.getByRole('button', { name: 'Dùng bản hiện tại' }),
    ).toBeVisible()
    await expect(
      ownerPage.getByLabel('Tên công việc', { exact: true }),
    ).toHaveValue('Unsaved owner draft')
    await ownerPage.getByRole('button', { name: 'Dùng bản hiện tại' }).click()
    await ownerPage.keyboard.press('Escape')
    checks.push(
      'Real realtime event preserves unsaved task draft and enables explicit reconciliation',
    )
    // Real commit, deliberately lost HTTP response, then exact-receipt retry.
    const requests: unknown[] = []
    await ownerPage.route('**/rest/v1/rpc/board_mutate', async (route) => {
      requests.push(route.request().postDataJSON())
      if (requests.length === 1) {
        const response = await route.fetch()
        expect(response.ok()).toBeTruthy()
        await route.abort('failed')
      } else await route.continue()
    })
    await ownerPage
      .getByRole('button', { name: 'Incoming member update', exact: true })
      .click()
    await ownerPage
      .getByLabel('Tên công việc', { exact: true })
      .fill('Cloud lost response saved')
    await ownerPage
      .getByRole('button', { name: 'Lưu công việc', exact: true })
      .click()
    await ownerPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Xác nhận lại thao tác' })
      .click()
    await expect(ownerPage.getByRole('dialog')).not.toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    await ownerPage.unroute('**/rest/v1/rpc/board_mutate')
    expect((await snapshot()).tasks).toHaveLength(100)
    checks.push(
      'Cloud committed write with lost response retries identical receipt; task count unchanged',
    )

    await ownerPage
      .getByRole('button', { name: 'Cloud lost response saved', exact: true })
      .click()
    await ownerPage
      .getByLabel('Tên công việc', { exact: true })
      .fill('Draft through reconnect')
    await ownerPage.context().setOffline(true)
    await write(
      'save_task',
      { ...input, title: 'Update while owner offline' },
      'member',
    )
    await ownerPage.context().setOffline(false)
    await expect(
      ownerPage.getByRole('button', { name: 'Dùng bản hiện tại' }),
    ).toBeVisible({ timeout: 20000 })
    await expect(
      ownerPage.getByLabel('Tên công việc', { exact: true }),
    ).toHaveValue('Draft through reconnect')
    await ownerPage.getByRole('button', { name: 'Dùng bản hiện tại' }).click()
    await ownerPage.keyboard.press('Escape')
    checks.push('Reconnect receives current state and preserves unsaved draft')

    const beforeMoves = await snapshot()
    const moves = await Promise.all(
      ['owner', 'member'].map((role, i) =>
        clients[role]!.rpc('board_mutate', {
          p_board: board,
          p_version: beforeMoves.board.version,
          p_mutation: randomUUID(),
          p_action: 'move_task',
          p_data: { id: beforeMoves.tasks[i].id, status: 'doing', position: 0 },
        }),
      ),
    )
    expect(moves.filter((r) => !r.error)).toHaveLength(1)
    expect(moves.find((r) => r.error)?.error?.code).toBe('PT409')
    const afterMoves = await snapshot()
    expect(new Set(afterMoves.tasks.map((t: any) => t.id)).size).toBe(100)
    expect(afterMoves.tasks).toHaveLength(100)
    checks.push(
      'Concurrent reorder returns one conflict without lost or duplicate tasks',
    )

    let viewerEvents = 0,
      ownerEvents = 0
    for (const role of ['owner', 'viewer']) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('QA channel subscription timeout')),
          15000,
        )
        clients[role]!.channel(`qa-revoke-${role}-${board}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'boards',
              filter: `id=eq.${board}`,
            },
            () => {
              if (role === 'viewer') viewerEvents++
              else ownerEvents++
            },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timer)
              resolve()
            }
          })
      })
    }
    await write('rename', { name: 'QA subscription baseline' })
    await expect.poll(() => viewerEvents).toBeGreaterThan(0)
    await expect.poll(() => ownerEvents).toBeGreaterThan(0)
    await call('owner', 'workspace_member_change', {
      p_workspace: workspace,
      p_user: identities.member,
      p_role: 'viewer',
    })
    await denied('member', 'task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: randomUUID(),
      p_body: 'Forbidden after downgrade',
    })
    await expect(
      memberPage.getByRole('button', { name: 'Tạo công việc', exact: true }),
    ).not.toBeVisible()
    await call('owner', 'workspace_member_remove', {
      p_workspace: workspace,
      p_user: identities.viewer,
    })
    const viewerBaseline = viewerEvents,
      ownerBaseline = ownerEvents
    await write('rename', { name: 'QA private event after revocation' })
    await expect.poll(() => ownerEvents).toBeGreaterThan(ownerBaseline)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(viewerEvents).toBe(viewerBaseline)
    checks.push(
      'Previously active Viewer subscription receives no private board event after removal; Owner control receives it',
    )
    await denied('viewer', 'board_snapshot', { p_board: board })
    await pages[2]!
      .getByRole('button', { name: 'Tải lại', exact: true })
      .click()
    await expect(pages[2]!.getByRole('alert')).toContainText(
      /không còn quyền|không tồn tại/,
    )
    await expect(pages[2]!.locator('.task-card')).toHaveCount(0)
    checks.push(
      'Role downgrade blocks writes and updates UI; removed viewer loses RPC and visible data on refresh',
    )
    report.completed = true
    await ownerPage.screenshot({
      path: 'output/playwright/cloud-verified.png',
      fullPage: false,
    })
  } finally {
    report.finishedAt = new Date().toISOString()
    // Keep isolated QA data recoverable; no hard deletion or mutation of pre-existing workspaces.
    if (workspace) {
      try {
        await write('archive_board', {})
        for (const role of ['member', 'viewer']) {
          const members = await call('owner', 'workspace_member_list', {
            p_workspace: workspace,
          })
          if (members.some((m: any) => m.user_id === identities[role]))
            await call('owner', 'workspace_member_remove', {
              p_workspace: workspace,
              p_user: identities[role],
            })
        }
        await call('owner', 'workspace_rename', {
          p_workspace: workspace,
          p_name: `QA MVP — ${report.completed ? 'verified' : 'incomplete'} — archived board`,
        })
        report.cleanup =
          'Board archived; QA memberships removed; workspace retained for audit'
      } catch {
        report.cleanup =
          'Incomplete; inspect isolated QA workspace IDs in report'
      }
    }
    for (const context of contexts) await context.close()
    for (const client of Object.values(clients)) {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }
    mkdirSync('output/playwright', { recursive: true })
    writeFileSync(
      'output/playwright/cloud-verification.json',
      JSON.stringify(report, null, 2),
    )
  }
})
