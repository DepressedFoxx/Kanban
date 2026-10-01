import { test, expect, login, users } from './fixture'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

test('login, workspace/board/task, comments, deep link, archive/restore and logout', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page)
  await page.getByLabel('Tên workspace').fill('Created through UI')
  await page.getByRole('button', { name: 'Tạo workspace', exact: true }).click()
  await expect(page).toHaveURL(/\/members$/)
  await page.goto(`/workspaces/${harness.workspace}/boards`)
  await page.getByLabel('Tên board mới').fill('Created Board')
  await page.getByRole('button', { name: 'Tạo board', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Created Board', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click()
  await page.getByLabel('Tên công việc', { exact: true }).fill('Created Task')
  await page.getByRole('button', { name: 'Lưu công việc', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Created Task', exact: true }).click()
  const link = page.url()
  await page
    .getByRole('button', { name: 'Bình luận & lịch sử', exact: true })
    .click()
  await page.getByLabel('Bình luận mới').fill('E2E comment <b>plain text</b>')
  await page.getByRole('button', { name: 'Gửi bình luận', exact: true }).click()
  await expect(
    page.getByText('E2E comment <b>plain text</b>', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(link)
  await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveValue(
    'Created Task',
  )
  await page
    .getByRole('button', { name: 'Lưu trữ công việc', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page
    .getByRole('button', { name: 'Công việc lưu trữ (1)', exact: true })
    .click()
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).click()
  await expect(page.getByText('Chưa có công việc lưu trữ.')).toBeVisible()
  await page.getByRole('button', { name: 'Mở menu tài khoản' }).click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto(link)
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

test('committed write with lost response retries exact receipt and does not duplicate task/activity', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click()
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Lost response task')
  harness.loseNextWrite = true
  await page.getByRole('button', { name: 'Lưu công việc', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('button', { name: 'Xác nhận lại thao tác' }),
  ).toBeVisible()
  await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveValue(
    'Lost response task',
  )
  await dialog.getByRole('button', { name: 'Xác nhận lại thao tác' }).click()
  await expect(dialog).not.toBeVisible()
  expect(harness.mutations).toHaveLength(2)
  expect(harness.mutations[1]).toEqual(harness.mutations[0])
  const state = await harness.snapshot()
  const items = state.tasks.filter((t: any) => t.title === 'Lost response task')
  expect(items).toHaveLength(1)
  const thread = await harness.rpc('owner', 'task_thread', {
    p_board: harness.board,
    p_task: items[0].id,
  })
  expect(thread.activity).toHaveLength(1)
})

test('request deadline releases UI and offline retry stays blocked until online', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click()
  await page.getByLabel('Tên công việc', { exact: true }).fill('Timeout draft')
  harness.holdNextWrite = true
  await page.getByRole('button', { name: 'Lưu công việc', exact: true }).click()
  const retry = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Xác nhận lại thao tác' })
  await expect(retry).toBeVisible({ timeout: 20000 })
  await context.setOffline(true)
  await retry.click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('alert')
      .filter({ hasText: 'Đang offline' }),
  ).toBeVisible()
  expect(harness.mutations).toHaveLength(1)
  await context.setOffline(false)
  await retry.click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(harness.mutations[1]).toEqual(harness.mutations[0])
})

test('two sessions conflict without overwriting draft; revoked member loses access', async ({
  browser,
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  const other = await browser.newContext()
  try {
    await harness.attach(other, 'member')
    const member = await other.newPage()
    const path = `/boards/${harness.board}?task=${harness.task}`
    await login(page, 'owner', path)
    await login(member, 'member', path)
    await page.getByLabel('Tên công việc', { exact: true }).fill('Owner draft')
    await member
      .getByLabel('Tên công việc', { exact: true })
      .fill('Member saved')
    await member
      .getByRole('button', { name: 'Lưu công việc', exact: true })
      .click()
    await expect(member.getByRole('dialog')).not.toBeVisible()
    await page
      .getByRole('button', { name: 'Lưu công việc', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Dùng bản hiện tại' }),
    ).toBeVisible()
    await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveValue(
      'Owner draft',
    )
    expect((await harness.snapshot()).tasks[0].title).toBe('Member saved')
    await harness.rpc('owner', 'workspace_member_remove', {
      p_workspace: harness.workspace,
      p_user: users.member!.id,
    })
    await member.getByRole('button', { name: 'Tải lại', exact: true }).click()
    await expect(member.getByRole('alert')).toContainText(
      /không còn quyền|không tồn tại/,
    )
    await expect(
      member.getByRole('button', { name: 'Member saved', exact: true }),
    ).not.toBeVisible()
  } finally {
    await other.close()
  }
})

test('viewer and outsider UI restrictions agree with real local SQL permissions', async ({
  browser,
  harness,
}) => {
  for (const actor of ['viewer', 'outsider']) {
    const context = await browser.newContext()
    try {
      await harness.attach(context, actor)
      const page = await context.newPage()
      await login(page, actor, `/boards/${harness.board}`)
      if (actor === 'viewer') {
        await expect(
          page.getByText('Vai trò Viewer:', { exact: false }),
        ).toBeVisible()
        await expect(
          page.getByRole('button', { name: 'Tạo công việc' }),
        ).not.toBeVisible()
      } else
        await expect(page.getByRole('alert')).toContainText(
          /không tồn tại|không còn quyền/,
        )
      await expect(
        harness.rpc(actor, 'board_mutate', {
          p_board: harness.board,
          p_version: 2,
          p_mutation: randomUUID(),
          p_action: 'rename',
          p_data: { name: 'Forbidden' },
        }),
      ).rejects.toMatchObject({ code: '42501' })
    } finally {
      await context.close()
    }
  }
})

for (const width of [390, 768, 1440]) {
  test(`screens and accessibility at ${width}px`, async ({
    page,
    context,
    harness,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await harness.attach(context)
    await login(page)
    for (const path of [
      '/workspaces',
      `/workspaces/${harness.workspace}/boards`,
      `/workspaces/${harness.workspace}/members`,
      '/account',
      `/boards/${harness.board}`,
      `/boards/${harness.board}?task=${harness.task}`,
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading').first()).toBeVisible()
      if (path.includes('?task='))
        await expect(page.getByRole('dialog')).toBeVisible()
      else await expect(page.getByText('Đang tải board…')).not.toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true)
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(
        result.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([])
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.screenshot({
      path: `output/playwright/mvp-${width}.png`,
      fullPage: true,
    })
  })
}

test('guest auth routes, invalid callback and denied invitation are accessible', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password#error=access_denied',
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(scan.violations.map((v) => v.id)).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
  }
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(users.owner!.email)
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill('WrongFixturePassword')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await login(page)
  await page.goto('/invite/' + 'a'.repeat(64))
  await expect(page.getByRole('alert')).toContainText(/không hợp lệ|hết hạn/)
  await expect(
    page.getByRole('button', { name: 'Chấp nhận lời mời' }),
  ).toBeDisabled()
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(scan.violations.map((v) => v.id)).toEqual([])
})

test('mobile drawer traps focus and Escape restores trigger; filtered empty and offline preserve draft', async ({
  page,
  context,
  harness,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  const trigger = page.getByRole('button', { name: 'Mở menu điều hướng' })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Tab')
  expect(
    await page
      .getByRole('dialog')
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page
    .getByRole('textbox', { name: 'Tìm công việc' })
    .fill('No matching item')
  await expect(page.getByText('Không có kết quả phù hợp').first()).toBeVisible()
  await page.getByRole('textbox', { name: 'Tìm công việc' }).fill('')
  await page.getByRole('button', { name: 'E2E Task', exact: true }).click()
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Keep offline draft')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Lưu công việc', exact: true }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('alert')
      .filter({ hasText: 'Đang offline' }),
  ).toBeVisible()
  expect(harness.mutations).toHaveLength(0)
  await context.setOffline(false)
  await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveValue(
    'Keep offline draft',
  )
  await page.getByRole('button', { name: 'Lưu công việc', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
