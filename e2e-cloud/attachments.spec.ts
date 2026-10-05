import { test, expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { restoreQa } from '../scripts/restore-g5-qa'

test('G5 cloud file permissions, lost response retry, moderation, export and isolated restore', async ({
  browser,
}) => {
  const clients: Record<string, SupabaseClient> = {},
    uids: Record<string, string> = {},
    tokens: Record<string, string> = {},
    contexts: BrowserContext[] = []
  const base = process.env.VITE_SUPABASE_URL!,
    key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    board = randomUUID(),
    task = randomUUID()
  let workspace = '',
    memberRemoved = false,
    viewerJoined = false
  const uploaded = new Set<string>(),
    report: Record<string, any> = {
      startedAt: new Date().toISOString(),
      completed: false,
    }
  const rpc = async (
    role: string,
    name: string,
    args: Record<string, unknown> = {},
  ) => {
    const { data, error } = await clients[role]!.rpc(name, args)
    if (error) throw Error(name + ': ' + error.code + ' ' + error.message)
    return data
  }
  const edge = async (
    role: string,
    action: string,
    data: Record<string, unknown>,
  ) => {
    const response = await fetch(base + '/functions/v1/task-files', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + tokens[role],
        apikey: key,
        'x-action': action,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    return { status: response.status, data: await response.json() }
  }
  const upload = async (
    role: string,
    id: string,
    name: string,
    content: string,
  ) => {
    const response = await fetch(base + '/functions/v1/task-files', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + tokens[role],
        apikey: key,
        'x-action': 'upload',
        'x-task-id': task,
        'x-attachment-id': id,
        'x-file-name': encodeURIComponent(name),
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    })
    return { status: response.status, data: await response.json() }
  }
  try {
    for (const role of ['owner', 'member', 'viewer']) {
      const client = createClient(base, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      clients[role] = client
      const { data, error } = await client.auth.signInWithPassword({
        email: process.env['E2E_' + role.toUpperCase() + '_EMAIL']!,
        password: process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!,
      })
      if (error || !data.user?.email_confirmed_at || !data.session)
        throw Error('QA login failed: ' + role)
      uids[role] = data.user.id
      tokens[role] = data.session.access_token
    }
    workspace = await rpc('owner', 'workspace_create', {
      p_name: 'QA G5 Files ' + new Date().toISOString(),
    })
    report.workspace = workspace
    report.task = task
    for (const role of ['member', 'viewer']) {
      const token = await rpc('owner', 'workspace_invite', {
        p_workspace: workspace,
        p_email: process.env['E2E_' + role.toUpperCase() + '_EMAIL'],
        p_role: role,
      })
      await rpc(role, 'workspace_invitation_accept', { p_token: token })
      if (role === 'viewer') viewerJoined = true
    }
    await rpc('owner', 'board_create', {
      p_workspace: workspace,
      p_id: board,
      p_name: 'QA G5 board',
    })
    const s = await rpc('owner', 'board_snapshot', { p_board: board })
    await rpc('owner', 'board_mutate', {
      p_board: board,
      p_version: s.board.version,
      p_mutation: randomUUID(),
      p_action: 'save_task',
      p_data: {
        id: task,
        title: 'G5 file task',
        description: 'QA only',
        status: 'todo',
        priority: 'medium',
        assignee_id: uids.member,
        due_date: '',
      },
    })
    const label = randomUUID()
    for (const [action, data] of [
      ['label_save', { id: label, name: 'G5 backup', color: 'blue' }],
      [
        'task_details',
        {
          id: task,
          label_ids: [label],
          items: [
            { id: randomUUID(), body: 'Verify restored links', done: true },
          ],
        },
      ],
    ] as const) {
      const latest = await rpc('owner', 'board_snapshot', { p_board: board })
      await rpc('owner', 'board_mutate', {
        p_board: board,
        p_version: latest.board.version,
        p_mutation: randomUUID(),
        p_action: action,
        p_data: data,
      })
    }
    await rpc('member', 'task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: randomUUID(),
      p_body: 'QA comment preserved during restore',
    })
    const invalid = await upload(
      'member',
      randomUUID(),
      'fake.png',
      'not a png',
    )
    expect(invalid.status).toBe(415)
    expect(
      (await upload('viewer', randomUUID(), 'viewer.txt', 'denied')).status,
    ).toBe(403)
    const open = async (role: string) => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      })
      contexts.push(context)
      const page = await context.newPage()
      await page.goto(
        `/login?redirect=${encodeURIComponent(`/boards/${board}?task=${task}`)}`,
      )
      await page
        .getByLabel('Email', { exact: true })
        .fill(process.env['E2E_' + role.toUpperCase() + '_EMAIL']!)
      await page
        .getByLabel('Mật khẩu', { exact: true })
        .fill(process.env['E2E_' + role.toUpperCase() + '_PASSWORD']!)
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      return page
    }
    const ownerPage = await open('owner'),
      memberPage = await open('member')
    const filename = 'ghi-chu-G5.txt',
      content = Buffer.from(
        'Nội dung QA G5 — file thật trên Storage.\n',
        'utf8',
      )
    let lost = false
    await memberPage.route('**/functions/v1/task-files', async (route) => {
      if (!lost && route.request().headers()['x-action'] === 'upload') {
        const response = await route.fetch()
        expect(response.status()).toBe(200)
        lost = true
        await route.abort('connectionreset')
      } else await route.continue()
    })
    await memberPage.getByLabel('Thêm file', { exact: true }).setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: content,
    })
    await expect(
      memberPage.getByRole('button', {
        name: 'Thử lại thao tác file',
        exact: true,
      }),
    ).toBeVisible()
    await memberPage
      .getByRole('button', { name: 'Thử lại thao tác file', exact: true })
      .click()
    await expect(
      memberPage.getByRole('status').filter({ hasText: 'Đã tải file lên.' }),
    ).toBeVisible()
    const list = await rpc('owner', 'attachment_list', { p_task: task })
    expect(list.items).toHaveLength(1)
    const file = list.items[0]
    uploaded.add(file.id)
    expect(file.sha256).toBe(createHash('sha256').update(content).digest('hex'))
    // Existing board realtime revision invalidates the attachment list in another session.
    await expect(ownerPage.getByText(filename, { exact: true })).toBeVisible({
      timeout: 10000,
    })
    await ownerPage
      .getByRole('region', { name: 'File đính kèm', exact: true })
      .scrollIntoViewIfNeeded()
    await ownerPage.screenshot({ path: 'output/playwright/g5-task-mobile.png' })
    report.retryWithoutDuplicate = true
    report.realtimeOtherSession = true
    const link = await edge('viewer', 'download', { id: file.id })
    expect(link.status).toBe(200)
    expect(link.data.expires_in).toBe(60)
    const download = await fetch(link.data.url)
    expect(download.ok).toBe(true)
    const bytes = new Uint8Array(await download.arrayBuffer())
    expect(Buffer.from(bytes).equals(content)).toBe(true)
    expect(download.headers.get('content-disposition')).toContain('attachment')
    const direct = await clients
      .member!.storage.from('task-attachments')
      .download(`${workspace}/${task}/${file.id}`)
    expect(direct.error).toBeTruthy()
    const forged = await clients.member!.rpc('attachment_service', {
      p_user: uids.owner,
      p_action: 'download',
      p_data: { id: file.id },
    })
    expect(forged.error).toBeTruthy()
    expect(
      (
        await edge('owner', 'delete', {
          id: file.id,
          receipt: randomUUID(),
          reason: '',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await clients.member!.rpc('workspace_export', {
          p_workspace: workspace,
        })
      ).error,
    ).toBeTruthy()
    const snapshot = await rpc('owner', 'workspace_export', {
      p_workspace: workspace,
    })
    expect(snapshot.manifest.counts.attachments).toBe(1)
    expect(snapshot.manifest.counts.comments).toBe(1)
    expect(snapshot.manifest.counts.checklist).toBe(1)
    expect(snapshot.manifest.counts.task_labels).toBe(1)
    expect(JSON.stringify(snapshot.members)).not.toContain('@')
    mkdirSync('output/playwright/g5-backup', { recursive: true })
    writeFileSync(
      'output/playwright/g5-backup/workspace.json',
      JSON.stringify(snapshot, null, 2),
    )
    writeFileSync('output/playwright/g5-backup/' + file.id, bytes)
    report.restore = await restoreQa(
      snapshot,
      new Map([[file.id, bytes]]),
      'output/playwright/g5-restore',
    )
    await ownerPage
      .getByRole('button', { name: `Xoá ${filename}`, exact: true })
      .click()
    await expect(
      ownerPage.getByRole('button', { name: 'Xoá file', exact: true }),
    ).toBeDisabled()
    await ownerPage
      .getByLabel('Lý do xoá file của thành viên khác')
      .fill('Dọn file QA sau diễn tập')
    await ownerPage
      .getByRole('button', { name: 'Xoá file', exact: true })
      .click()
    await expect(ownerPage.getByRole('alertdialog')).toHaveCount(0)
    await expect(ownerPage.getByText(filename, { exact: true })).toHaveCount(0)
    uploaded.delete(file.id)
    await expect(memberPage.getByText(filename, { exact: true })).toHaveCount(
      0,
      { timeout: 10000 },
    )
    expect((await edge('viewer', 'download', { id: file.id })).status).toBe(403)
    const second = randomUUID()
    expect(
      (await upload('owner', second, 'revoke.txt', 'revoke test')).status,
    ).toBe(200)
    uploaded.add(second)
    await rpc('owner', 'workspace_member_remove', {
      p_workspace: workspace,
      p_user: uids.member,
    })
    memberRemoved = true
    expect((await edge('member', 'download', { id: second })).status).toBe(403)
    const outsider = await clients.member!.rpc('attachment_list', {
      p_task: task,
    })
    expect(outsider.error).toBeTruthy()
    await ownerPage.goto(`/workspaces/${workspace}/settings`)
    const dlPromise = ownerPage.waitForEvent('download')
    await ownerPage
      .getByRole('button', { name: 'Tải bản xuất JSON', exact: true })
      .click()
    const dl = await dlPromise
    const path = await dl.path()
    expect(JSON.parse(readFileSync(path!, 'utf8')).schema_version).toBe(1)
    expect(
      (
        await new AxeBuilder({ page: ownerPage })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    expect(
      await ownerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await ownerPage.screenshot({
      path: 'output/playwright/g5-export-mobile.png',
      fullPage: true,
    })
    report.completed = true
  } finally {
    try {
      if (workspace) {
        const remaining = await rpc('owner', 'attachment_list', {
          p_task: task,
        })
        for (const file of remaining.items) uploaded.add(file.id)
      }
      for (const id of uploaded) {
        const result = await edge('owner', 'delete', {
          id,
          receipt: randomUUID(),
          reason: 'Dọn dữ liệu QA G5',
        })
        if (result.status !== 200) throw Error('File cleanup failed')
      }
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
        'QA files deleted, memberships removed, workspace archived'
    } catch {
      report.cleanup = 'Incomplete; inspect QA workspace'
    }
    for (const c of contexts) await c.close()
    for (const c of Object.values(clients))
      await c.auth.signOut({ scope: 'local' })
    report.finishedAt = new Date().toISOString()
    mkdirSync('output/playwright', { recursive: true })
    writeFileSync(
      'output/playwright/g5-cloud-verification.json',
      JSON.stringify(report, null, 2),
    )
  }
})
