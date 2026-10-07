import { test, expect, login } from './fixture'

test('page titles, mobile targets and reduced-motion drawer remain usable', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await login(page, 'owner', `/boards/${harness.board}`)
  await expect(page).toHaveTitle(/ · kanban$/)
  const boardTitle = await page.title()
  const trigger = page.getByRole('button', { name: 'Mở menu điều hướng' })
  const bounds = await trigger.boundingBox()
  expect(bounds!.width).toBeGreaterThanOrEqual(44)
  expect(bounds!.height).toBeGreaterThanOrEqual(44)
  await trigger.click()
  const drawer = page.getByRole('dialog', { name: 'Menu điều hướng' })
  await expect(drawer).toBeVisible()
  expect(await drawer.evaluate((e) => getComputedStyle(e).animationName)).toBe(
    'none',
  )
  const close = drawer.locator('[data-slot="dialog-close"]')
  const closeBounds = await close.boundingBox()
  expect(closeBounds!.width).toBeGreaterThanOrEqual(44)
  expect(closeBounds!.height).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await drawer.getByRole('link', { name: 'Hướng dẫn', exact: true }).click()
  await expect(page).toHaveTitle('Hướng dẫn sử dụng · kanban')
  expect(await page.title()).not.toBe(boardTitle)
  await expect(drawer).toBeHidden()
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
