import { test, expect, login } from './fixture'

test('main screens keep controls separated at mobile tablet and desktop widths', async ({
  page,
  context,
  harness,
}) => {
  test.setTimeout(120000)
  await harness.attach(context)
  await login(page, 'owner', '/workspaces')
  const routes = [
    '/workspaces',
    `/workspaces/${harness.workspace}/boards`,
    `/workspaces/${harness.workspace}/members`,
    `/workspaces/${harness.workspace}/settings`,
    `/boards/${harness.board}?returnTo=/my-tasks`,
    '/my-tasks',
    '/notifications',
    '/account',
    '/guide',
  ]
  for (const width of [390, 604, 768, 1440]) {
    await page.setViewportSize({ width, height: 884 })
    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('main')).toBeVisible()
      for (const summary of await page
        .locator('main details > summary')
        .all()) {
        if (await summary.isVisible()) await summary.click()
      }
      const failures = await page.locator('main').evaluate((main) => {
        const elements = Array.from(
          main.querySelectorAll(
            'a,button,input:not([type="hidden"]),textarea,[role="combobox"]',
          ),
        ).filter(
          (el) =>
            el.getBoundingClientRect().width > 0 &&
            el.getBoundingClientRect().height > 0 &&
            !el.closest('[aria-hidden="true"],[inert],details:not([open])') &&
            el.checkVisibility({
              checkVisibilityCSS: true,
              checkOpacity: true,
            }),
        )
        const errors: string[] = []
        for (let i = 0; i < elements.length; i++)
          for (let j = i + 1; j < elements.length; j++) {
            const a = elements[i]!,
              b = elements[j]!
            if (a.contains(b) || b.contains(a)) continue
            const x = a.getBoundingClientRect(),
              y = b.getBoundingClientRect()
            const dx = Math.min(x.right, y.right) - Math.max(x.left, y.left),
              dy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top)
            const names = () =>
              [a, b]
                .map(
                  (e) =>
                    e.getAttribute('aria-label') ||
                    e.textContent?.trim() ||
                    e.tagName,
                )
                .join(' / ')
            if (dx > 1 && dy > 1) errors.push('Overlap: ' + names())
            if (
              a.parentElement === b.parentElement &&
              dy > Math.min(x.height, y.height) / 2 &&
              dx <= 0 &&
              -dx < 7
            )
              errors.push('Gap below 8px: ' + names())
          }
        return errors
      })
      expect(failures, `${width}px ${route}`).toEqual([])
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width}px ${route} overflow`,
      ).toBe(true)
      if (route.endsWith('/boards')) {
        const nav = page.getByRole('navigation', {
          name: 'Điều hướng workspace',
          exact: true,
        })
        const links = nav.getByRole('link')
        const a = await links.nth(0).boundingBox(),
          b = await links.nth(1).boundingBox()
        expect(
          Math.max(b!.x - a!.x - a!.width, b!.y - a!.y - a!.height),
        ).toBeGreaterThanOrEqual(12)
        if (width === 604)
          await page.screenshot({
            path: 'output/playwright/boards-spacing-604.png',
          })
      }
    }
  }
})

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
