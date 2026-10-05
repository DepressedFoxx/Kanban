import { test, expect, login, users } from './fixture'
import AxeBuilder from '@axe-core/playwright'
test('G4 mobile inbox read retry, preferences, task watch and access revocation', async ({
  page,
  context,
  harness,
}) => {
  await harness.save('owner', {
    id: harness.task,
    title: 'Notify member',
    description: '',
    status: 'todo',
    priority: 'high',
    assignee_id: users.member!.id,
    due_date: '',
  })
  await harness.attach(context, 'member')
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'member', '/notifications')
  await expect(
    page.getByRole('link', { name: 'Notify member', exact: true }),
  ).toBeVisible()
  harness.loseNextWrite = true
  await page
    .getByRole('button', { name: 'Đánh dấu đã đọc', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: 'Xác nhận lại thao tác thông báo',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('button', { name: 'Đánh dấu chưa đọc', exact: true }),
  ).toBeVisible()
  const feed = await harness.rpc('member', 'notification_feed')
  expect(feed.items[0].version).toBe(2)
  await page.getByText('Tùy chọn thông báo', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Khi được giao việc', exact: true })
    .click()
  await page.getByRole('button', { name: 'Lưu tùy chọn', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Khi được giao việc', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'output/playwright/g4-notifications-mobile.png',
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Notify member', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page
    .getByRole('button', { name: 'Bỏ theo dõi task', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Theo dõi task', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await harness.rpc('owner', 'workspace_member_remove', {
    p_workspace: harness.workspace,
    p_user: users.member!.id,
  })
  await page.goto('/notifications')
  await expect(
    page.getByRole('heading', { name: 'Không có thông báo phù hợp' }),
  ).toBeVisible()
})
test('G4 invitation preview, cancel and idempotent accept after lost response', async ({
  page,
  context,
  harness,
}) => {
  await harness.rpc('owner', 'workspace_invite', {
    p_workspace: harness.workspace,
    p_email: users.outsider!.email,
    p_role: 'viewer',
  })
  await harness.attach(context, 'outsider')
  await login(page, 'outsider', '/notifications')
  await page.getByRole('button', { name: 'Xem lời mời', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText('viewer')
  await page.getByRole('button', { name: 'Hủy', exact: true }).click()
  expect(
    await harness.rpc('outsider', 'workspace_role', {
      p_workspace: harness.workspace,
    }),
  ).toBeNull()
  await page.getByRole('button', { name: 'Xem lời mời', exact: true }).click()
  harness.loseNextWrite = true
  await page
    .getByRole('button', { name: 'Xác nhận tham gia', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', {
      name: 'Xác nhận lại thao tác thông báo',
      exact: true,
    })
    .click()
  await expect(page.getByRole('alertdialog')).not.toBeVisible()
  expect(
    await harness.rpc('outsider', 'workspace_role', {
      p_workspace: harness.workspace,
    }),
  ).toBe('viewer')
  await expect(
    page.getByRole('heading', { name: 'Không có thông báo phù hợp' }),
  ).toBeVisible()
})
