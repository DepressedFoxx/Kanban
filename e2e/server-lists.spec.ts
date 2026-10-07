import { test, expect, login, users } from './fixture'
import { randomUUID } from 'node:crypto'

test('task header drags across columns while menu stays a separate action', async ({
  page,
  context,
  harness,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  const header = page.locator('.task-card-header')
  await expect(header).toHaveClass(/drag-handle/)
  await expect(page.locator('.lucide-grip-vertical')).toHaveCount(0)
  const source = await header.boundingBox()
  const target = await page
    .getByRole('region', { name: 'Đang làm', exact: true })
    .locator('.min-h-24')
    .boundingBox()
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    source!.x + source!.width / 2 + 12,
    source!.y + source!.height / 2 + 10,
    { steps: 5 },
  )
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 35, {
    steps: 20,
  })
  await page.mouse.up()
  await expect(
    page.getByRole('heading', { name: 'Đang làm · 1', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Thao tác: E2E Task', exact: true })
    .click()
  await expect(page.getByRole('menu')).toBeVisible()
  expect(
    (await harness.snapshot('owner')).tasks.find(
      (t: any) => t.id === harness.task,
    ).status,
  ).toBe('doing')
})

test('card action menu moves and archives without opening task details', async ({
  page,
  context,
  harness,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await harness.attach(context)
  await login(page, 'owner', `/boards/${harness.board}`)
  const trigger = page.getByRole('button', {
    name: 'Thao tác: E2E Task',
    exact: true,
  })
  await trigger.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page
    .getByRole('menuitem', { name: 'Chuyển sang Đang làm', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Đang làm · 1', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await page
    .getByRole('menuitem', { name: 'Lưu trữ công việc', exact: true })
    .click()
  await expect(trigger).toHaveCount(0)
  expect(
    (await harness.snapshot('owner')).tasks.find(
      (t: any) => t.id === harness.task,
    ).archived_at,
  ).toBeTruthy()
  await page.getByText('Công cụ board', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Công việc lưu trữ (1)', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'E2E Task', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).click()
  await expect(page.getByText('Chưa có công việc lưu trữ.')).toBeVisible()
})

test('board pagination controls request server pages and controls align across breakpoints', async ({
  page,
  context,
  harness,
}) => {
  for (let i = 0; i < 13; i++)
    await harness.rpc('owner', 'board_create', {
      p_workspace: harness.workspace,
      p_id: randomUUID(),
      p_name: `Paged ${i}`,
    })
  await harness.attach(context)
  await login(page, 'owner', `/workspaces/${harness.workspace}/boards`)
  await page
    .getByRole('textbox', { name: 'Tìm board', exact: true })
    .fill('Paged')
  await page.getByRole('button', { name: 'Tìm board', exact: true }).click()
  await expect(page.getByText('1–13 / 13')).toBeVisible()
  await page.getByRole('combobox', { name: 'Mỗi trang', exact: true }).click()
  const sizeRequest = page.waitForRequest(
    (r) =>
      r.url().includes('/rpc/app_list_query') &&
      r.postDataJSON()?.p_page_size === 10,
  )
  await page.getByRole('option', { name: '10', exact: true }).click()
  expect((await sizeRequest).postDataJSON()).toMatchObject({
    p_page: 1,
    p_page_size: 10,
    p_filters: { search: 'Paged' },
  })
  await expect(page.getByText('1–10 / 13')).toBeVisible()
  const next = page.waitForRequest(
    (r) =>
      r.url().includes('/rpc/app_list_query') && r.postDataJSON()?.p_page === 2,
  )
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
  expect((await next).postDataJSON()).toMatchObject({
    p_page: 2,
    p_page_size: 10,
  })
  await expect(page.getByText('11–13 / 13')).toBeVisible()
  for (const width of [390, 544, 768, 1440]) {
    await page.setViewportSize({ width, height: 884 })
    const field = await page
      .getByRole('textbox', { name: 'Tìm board', exact: true })
      .boundingBox()
    const button = await page
      .getByRole('button', { name: 'Tìm board', exact: true })
      .boundingBox()
    expect(field!.height).toBe(button!.height)
    expect(field!.y).toBe(button!.y)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})

test('comments and workspace activity use bounded pages and preserve permissions', async ({
  harness,
}) => {
  for (let i = 0; i < 13; i++)
    await harness.rpc('owner', 'task_comment_add', {
      p_board: harness.board,
      p_task: harness.task,
      p_id: randomUUID(),
      p_body: `Page comment ${i}`,
    })
  const args = { p_board: harness.board, p_task: harness.task, p_page_size: 10 }
  const first = await harness.rpc('viewer', 'task_thread_page', args)
  const last = await harness.rpc('member', 'task_thread_page', {
    ...args,
    p_comment_page: 2,
  })
  expect(first.comment_page.total).toBe(13)
  expect(first.comments).toHaveLength(10)
  expect(last.comments).toHaveLength(3)
  expect(
    new Set([...first.comments, ...last.comments].map((x) => x.id)).size,
  ).toBe(13)
  await expect(
    harness.rpc('outsider', 'task_thread_page', args),
  ).rejects.toThrow()
  await expect(
    harness.rpc('viewer', 'activity_page', {
      p_source: 'workspace_activity',
      p_workspace: harness.workspace,
    }),
  ).rejects.toThrow()
  const audit = await harness.rpc('owner', 'activity_page', {
    p_source: 'workspace_activity',
    p_workspace: harness.workspace,
  })
  expect(audit.page).toBe(1)
  expect(audit.pageSize).toBe(20)
})

test('server list RPCs paginate/filter before returning rows and preserve access boundaries', async ({
  harness,
}) => {
  for (let i = 0; i < 13; i++)
    await harness.rpc('owner', 'board_create', {
      p_workspace: harness.workspace,
      p_id: randomUUID(),
      p_name: `Paged ${String(i).padStart(2, '0')}`,
    })
  const args = {
    p_source: 'boards',
    p_workspace: harness.workspace,
    p_page: 1,
    p_page_size: 10,
    p_filters: { search: 'Paged', archived: false },
  }
  const first = await harness.rpc('member', 'app_list_query', args)
  const last = await harness.rpc('viewer', 'app_list_query', {
    ...args,
    p_page: 2,
  })
  expect(first.total).toBe(13)
  expect(first.items).toHaveLength(10)
  expect(last.items).toHaveLength(3)
  expect(new Set([...first.items, ...last.items].map((x) => x.id)).size).toBe(
    13,
  )
  expect(
    (await harness.rpc('owner', 'app_list_query', { ...args, p_page: 99 }))
      .page,
  ).toBe(2)
  await expect(
    harness.rpc('outsider', 'app_list_query', args),
  ).rejects.toThrow()
  await expect(
    harness.rpc('member', 'app_list_query', {
      ...args,
      p_source: 'invitations',
    }),
  ).rejects.toThrow()
  await expect(
    harness.rpc('owner', 'app_list_query', { ...args, p_page_size: 500 }),
  ).rejects.toThrow()
  const grants = await harness.db.query<{ allowed: boolean }>(
    "select has_function_privilege('anon','public.board_page_query(uuid,jsonb,integer,jsonb,uuid)','execute') allowed",
  )
  expect(grants.rows[0]!.allowed).toBe(false)
  await harness.db.query(
    'update auth.users set email_confirmed_at=null where id=$1',
    [users.outsider!.id],
  )
  await expect(
    harness.rpc('outsider', 'notification_page', {}),
  ).rejects.toThrow()
})

test('Kanban column counts, off-page detail and server search agree; viewer cannot mutate', async ({
  harness,
}) => {
  for (let i = 0; i < 12; i++)
    await harness.save('owner', {
      id: randomUUID(),
      title: `Server task ${i}`,
      description: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: null,
      due_date: '',
    })
  const first = await harness.rpc('owner', 'board_page_query', {
    p_board: harness.board,
    p_page_size: 10,
  })
  expect(first.pages.todo.total).toBe(13)
  expect(first.tasks).toHaveLength(10)
  const last = await harness.rpc('member', 'board_page_query', {
    p_board: harness.board,
    p_page_size: 10,
    p_pages: { todo: 2 },
    p_task: harness.task,
  })
  expect(last.tasks).toHaveLength(3)
  expect(last.detail.id).toBe(harness.task)
  const filtered = await harness.rpc('viewer', 'board_page_query', {
    p_board: harness.board,
    p_page_size: 10,
    p_filters: { search: 'Server task 11' },
  })
  expect(filtered.pages.todo.total).toBe(1)
  expect(filtered.tasks[0].title).toBe('Server task 11')
  await expect(
    harness.rpc('outsider', 'board_page_query', { p_board: harness.board }),
  ).rejects.toThrow()
  await expect(
    harness.rpc('viewer', 'board_page_mutate', {
      p_board: harness.board,
      p_version: first.board.version,
      p_mutation: randomUUID(),
      p_action: 'rename',
      p_data: { name: 'Forbidden' },
    }),
  ).rejects.toThrow()
})

test('pagination UI sends page/pageSize and My Tasks filters to the server', async ({
  page,
  context,
  harness,
}) => {
  await harness.attach(context)
  await login(page, 'owner', '/my-tasks')
  await expect(
    page.getByRole('heading', { name: 'Công việc của tôi' }),
  ).toBeVisible()
  await page.getByLabel('Tìm tên hoặc mô tả').fill('missing')
  const request = page.waitForRequest(
    (r) =>
      r.url().includes('/rpc/my_tasks_query') &&
      r.postDataJSON()?.p_filters?.search === 'missing',
  )
  await page
    .getByRole('button', { name: 'Áp dụng bộ lọc', exact: true })
    .click()
  expect((await request).postDataJSON()).toMatchObject({
    p_page: 1,
    p_limit: 20,
    p_filters: { search: 'missing' },
  })
  await expect(page.getByText('Không có công việc phù hợp')).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Phân trang công việc' }),
  ).toHaveCount(0)
})
