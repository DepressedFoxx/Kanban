import { test, expect, login } from './fixture'
import AxeBuilder from '@axe-core/playwright'

test('mobile settings preserves draft when cancelling navigation and returns focus', async ({
  page,
  context,
  harness,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await harness.attach(context)
  await login(page, 'owner', `/workspaces/${harness.workspace}/settings`)
  await page.getByLabel('Mô tả', { exact: true }).fill('Draft to keep')
  await page.getByRole('link', { name: 'Board', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toHaveAccessibleName('Bỏ thay đổi chưa lưu?')
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(page.getByLabel('Mô tả', { exact: true })).toHaveValue(
    'Draft to keep',
  )
  await expect(
    page.getByRole('link', { name: 'Board', exact: true }),
  ).toBeFocused()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({
    path: 'output/playwright/g1-settings-mobile.png',
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Board', exact: true }).click()
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click()
  await expect(page).toHaveURL(
    new RegExp(`/workspaces/${harness.workspace}/boards$`),
  )
})

test('settings edit, archive read-only, restore and audit through UI', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page, 'owner', `/workspaces/${harness.workspace}/settings`)
  await page.getByLabel('Mô tả', { exact: true }).fill('Workspace G1')
  await page.getByLabel('Múi giờ IANA').fill('UTC')
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã xác nhận' }),
  ).toBeVisible()
  await expect(page.getByLabel('Mô tả', { exact: true })).toHaveValue(
    'Workspace G1',
  )
  await page.getByLabel('Tên workspace', { exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Dữ liệu không hợp lệ')
  await page.getByLabel('Tên workspace', { exact: true }).fill('E2E Workspace')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
  await page
    .getByRole('button', { name: 'Lưu trữ workspace', exact: true })
    .click()
  await page.getByLabel('Nhập tên workspace để xác nhận').fill('E2E Workspace')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Xác nhận', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Khôi phục workspace', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Tên workspace', { exact: true })).toBeDisabled()
  await page.getByRole('link', { name: 'Board', exact: true }).click()
  await expect(page.getByText('Workspace đã lưu trữ — chỉ đọc.')).toBeVisible()
  await page
    .getByRole('link', { name: 'Cài đặt workspace', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Khôi phục workspace', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Xác nhận', exact: true })
    .click()
  await expect(page.getByLabel('Tên workspace', { exact: true })).toBeEnabled()
})

test('member can leave; owner cannot leave; transfer uses confirmation', async ({
  page,
  context,
  harness,
  browser,
}) => {
  await harness.attach(context)
  await login(page, 'owner', `/workspaces/${harness.workspace}/settings`)
  await expect(
    page.getByRole('button', { name: 'Rời workspace', exact: true }),
  ).not.toBeVisible()
  await page.getByRole('button', { name: 'Chuyển Owner', exact: true }).click()
  await page.getByRole('combobox', { name: 'Owner mới' }).click()
  await page.getByRole('option', { name: 'member', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Xác nhận', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Rời workspace', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Rời workspace', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Xác nhận', exact: true })
    .click()
  await expect(page).toHaveURL(/\/workspaces$/)
  const other = await browser.newContext()
  try {
    await harness.attach(other, 'member')
    const next = await other.newPage()
    await login(next, 'member', `/workspaces/${harness.workspace}/settings`)
    await expect(
      next.getByRole('button', { name: 'Chuyển Owner', exact: true }),
    ).toBeVisible()
  } finally {
    await other.close()
  }
})

test('settings retains dirty draft after remote version changes', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page, 'owner', `/workspaces/${harness.workspace}/settings`)
  await page.getByLabel('Tên workspace', { exact: true }).fill('Local draft')
  const current = await harness.rpc('owner', 'workspace_settings_get', {
    p_workspace: harness.workspace,
  })
  await harness.rpc('owner', 'workspace_mutate', {
    p_workspace: harness.workspace,
    p_version: current.version,
    p_mutation: crypto.randomUUID(),
    p_action: 'update',
    p_data: { name: 'Remote', description: '', timezone: 'UTC' },
  })
  await page.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Dùng bản hiện tại', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Tên workspace', { exact: true })).toHaveValue(
    'Local draft',
  )
  await page
    .getByRole('button', { name: 'Dùng bản hiện tại', exact: true })
    .click()
  await expect(page.getByLabel('Tên workspace', { exact: true })).toHaveValue(
    'Remote',
  )
})
