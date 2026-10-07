import { test, expect, login, users } from './fixture'
import AxeBuilder from '@axe-core/playwright'
test('G3 mobile search, saved filter retry, task return context and deletion', async ({
  page,
  context,
  harness,
}) => {
  await harness.save('owner', {
    id: harness.task,
    title: 'My assigned task',
    description: 'Needle content',
    status: 'todo',
    priority: 'high',
    assignee_id: users.owner!.id,
    due_date: '',
  })
  await harness.attach(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page, 'owner', '/my-tasks')
  await expect(
    page.getByRole('link', { name: 'My assigned task', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Tìm tên hoặc mô tả').fill('Needle')
  await page
    .getByRole('button', { name: 'Áp dụng bộ lọc', exact: true })
    .click()
  await expect(page).toHaveURL(/search=Needle/)
  await page.getByText('Bộ lọc đã lưu (0/20)', { exact: true }).click()
  await page.getByLabel('Tên bộ lọc', { exact: true }).fill('My preset')
  harness.loseNextWrite = true
  await page
    .getByRole('button', { name: 'Lưu bộ lọc mới', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Xác nhận lại lưu bộ lọc', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'My preset', exact: true }),
  ).toBeVisible()
  expect((await harness.rpc('owner', 'my_tasks_query')).saved).toHaveLength(1)
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
    path: 'output/playwright/g3-my-tasks-mobile.png',
    fullPage: true,
  })
  await page
    .getByRole('link', { name: 'My assigned task', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page
    .getByRole('link', { name: 'Công việc của tôi', exact: true })
    .click()
  await expect(page).toHaveURL(/search=Needle/)
  await expect(page.getByLabel('Tìm tên hoặc mô tả')).toHaveValue('Needle')
  await page.getByText('Bộ lọc đã lưu (1/20)', { exact: true }).click()
  await page.getByRole('button', { name: 'My preset', exact: true }).click()
  await page
    .getByRole('button', { name: 'Xóa bộ lọc đã lưu', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Xác nhận xóa bộ lọc', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'My preset', exact: true }),
  ).not.toBeVisible()
})
test('G3 empty, invalid query, denied refresh and filter preservation', async ({
  page,
  context,
  harness,
}) => {
  await harness.save('owner', {
    id: harness.task,
    title: 'Member work',
    description: 'Only member',
    status: 'todo',
    priority: 'medium',
    assignee_id: users.member!.id,
    due_date: '',
  })
  await harness.attach(context, 'member')
  await login(page, 'member', '/my-tasks')
  await expect(
    page.getByRole('link', { name: 'Member work', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Tìm tên hoặc mô tả').fill('No match')
  await page
    .getByRole('button', { name: 'Áp dụng bộ lọc', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Không có công việc phù hợp' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Member work', exact: true }),
  ).toBeVisible()
  await harness.db.query(
    'delete from public.workspace_members where workspace_id=$1 and user_id=$2',
    [harness.workspace, users.member!.id],
  )
  await page
    .getByRole('button', { name: 'Tải lại danh sách', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Member work', exact: true }),
  ).not.toBeVisible()
  await page.goto('/my-tasks?page=0')
  await expect(page.getByRole('alert')).toContainText(
    'Đường dẫn bộ lọc không hợp lệ',
  )
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Không có công việc phù hợp' }),
  ).toBeVisible()
})
