import { test, expect, login } from './fixture'
import AxeBuilder from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'

test('G2 mobile labels/checklist retain main draft, retry and duplicate', async ({
  page,
  context,
  harness,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  await page.getByText('Công cụ board', { exact: true }).click()
  await page.getByText('Quản lý nhãn (0/100)', { exact: true }).click()
  await page.getByLabel('Tên nhãn', { exact: true }).fill('Urgent')
  await page.getByRole('button', { name: 'Tạo nhãn', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Sửa nhãn Urgent', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'E2E Task', exact: true }).click()
  await page
    .getByLabel('Tên công việc', { exact: true })
    .fill('Unsaved main draft')
  const extras = page.getByRole('region', { name: 'Nhãn và checklist' })
  await extras.getByRole('button', { name: 'Urgent', exact: true }).click()
  await extras.getByRole('button', { name: 'Thêm mục', exact: true }).click()
  await page
    .getByLabel('Nội dung mục 1', { exact: true })
    .fill('Verify permissions')
  await page
    .getByRole('button', { name: 'Hoàn thành mục 1', exact: true })
    .click()
  harness.loseNextWrite = true
  await page
    .getByRole('button', { name: 'Lưu nhãn và checklist', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Xác nhận lại thao tác', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Tên công việc', { exact: true })).toHaveValue(
    'Unsaved main draft',
  )
  await expect(
    page.getByRole('button', { name: 'Lưu nhãn và checklist', exact: true }),
  ).toBeDisabled()
  expect((await harness.snapshot()).tasks[0].checklist).toHaveLength(1)
  await page.getByLabel('Tên công việc', { exact: true }).fill('E2E Task')
  await page
    .getByRole('button', { name: 'Nhân bản công việc đã lưu', exact: true })
    .click()
  await expect.poll(async () => (await harness.snapshot()).tasks.length).toBe(2)
  const copy = (await harness.snapshot()).tasks.find(
    (t: any) => t.id !== harness.task,
  )
  expect(copy.checklist[0].done).toBe(false)
  expect(copy.label_ids).toHaveLength(1)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({
    path: 'output/playwright/g2-task-mobile.png',
    fullPage: true,
  })
})
test('G2 bulk confirmation applies all selected tasks', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  await page.getByText('Công cụ board', { exact: true }).click()
  await page.getByText('Thao tác nhiều công việc', { exact: true }).click()
  await page.getByRole('button', { name: 'Chọn E2E Task', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Trạng thái hàng loạt', exact: true })
    .click()
  await page.getByRole('option', { name: 'Hoàn thành', exact: true }).click()
  await page
    .getByRole('button', { name: 'Đổi trạng thái đã chọn', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText('1 công việc')
  await page
    .getByRole('button', { name: 'Xác nhận thay đổi', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).not.toBeVisible()
  expect((await harness.snapshot()).tasks[0].status).toBe('done')
  await page.getByRole('button', { name: 'Chọn E2E Task', exact: true }).click()
  await page
    .getByRole('button', { name: 'Lưu trữ đã chọn', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Xác nhận thay đổi', exact: true })
    .click()
  await expect
    .poll(async () => (await harness.snapshot()).tasks[0].archived_at)
    .toBeTruthy()
})
test('G2 comment edit, conflict preserves draft and deletion tombstone', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context, 'member')
  await login(page, 'member', `/boards/${harness.board}?task=${harness.task}`)
  await page
    .getByRole('button', { name: 'Bình luận & lịch sử', exact: true })
    .click()
  await page.getByLabel('Bình luận mới').fill('Original')
  await page.getByRole('button', { name: 'Gửi bình luận', exact: true }).click()
  await page.getByRole('button', { name: 'Sửa bình luận', exact: true }).click()
  await page.getByLabel('Nội dung chỉnh sửa').fill('Edited')
  await page.getByRole('button', { name: 'Lưu bình luận', exact: true }).click()
  await expect(page.getByText('Edited', { exact: true })).toBeVisible()
  await expect(page.getByText('Đã chỉnh sửa', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sửa bình luận', exact: true }).click()
  await page.getByLabel('Nội dung chỉnh sửa').fill('Draft conflict')
  const thread = await harness.rpc('member', 'task_thread', {
    p_board: harness.board,
    p_task: harness.task,
  })
  await harness.rpc('member', 'task_comment_mutate', {
    p_board: harness.board,
    p_task: harness.task,
    p_comment: thread.comments[0].id,
    p_version: 2,
    p_mutation: randomUUID(),
    p_action: 'edit',
    p_body: 'Remote edit',
  })
  await page.getByRole('button', { name: 'Lưu bình luận', exact: true }).click()
  await expect(page.getByLabel('Nội dung chỉnh sửa')).toHaveValue(
    'Draft conflict',
  )
  await expect(page.getByRole('alert')).toContainText('Bình luận đã thay đổi')
  await page.getByRole('button', { name: 'Hủy sửa', exact: true }).click()
  await page
    .getByRole('button', { name: 'Tải lại thảo luận', exact: true })
    .click()
  await page.getByRole('button', { name: 'Xóa bình luận', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Xóa bình luận', exact: true })
    .click()
  await expect(
    page.getByText('Bình luận đã được xóa.', { exact: true }),
  ).toBeVisible()
})
