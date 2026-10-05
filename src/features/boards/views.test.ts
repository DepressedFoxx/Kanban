// @vitest-environment jsdom
vi.mock('@/lib/supabase', () => ({ supabase: null }))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import BoardsView from './views/BoardsView.vue'
import OnlineBoardView from './views/OnlineBoardView.vue'
import OnlineTaskDialog from './OnlineTaskDialog.vue'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  snapshot: vi.fn(),
  mutate: vi.fn(),
}))
const ws = vi.hoisted(() => ({
  list: vi.fn(),
  members: vi.fn(),
  invitations: vi.fn(),
}))
vi.mock('./api', () => ({ boardsApi: api }))
vi.mock('@/features/tasks/api', () => ({
  tasksApi: {
    thread: vi.fn(async () => ({
      can_comment: false,
      comments: [],
      activity: [],
    })),
  },
}))
vi.mock('@/features/workspaces/api', () => ({ workspaceApi: ws }))
const id = '20000000-0000-4000-8000-000000000001'
const taskId = '30000000-0000-4000-8000-000000000001'
const board = {
  id,
  workspace_id: id,
  name: 'Website',
  version: 1,
  archived_at: null,
  created_at: '2026-09-30',
  created_by: id,
}
const task = {
  id: taskId,
  board_id: id,
  title: 'Task A',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
  due_date: null,
  position: 0,
  archived_at: null,
}
const snapshot = (role = 'owner') => ({
  board: { ...board },
  role,
  tasks: [{ ...task }],
  members: [],
})
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.resetAllMocks()
  api.list.mockResolvedValue([board])
  api.snapshot.mockResolvedValue(snapshot())
  ws.list.mockResolvedValue([
    { id, name: 'Team', role: 'owner', created_at: '2026-09-30' },
  ])
  ws.members.mockResolvedValue([])
  ws.invitations.mockResolvedValue([])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
async function render(detail = false, routed = false) {
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workspaces/:workspaceId/boards', component: BoardsView },
      { path: '/boards/:boardId', component: OnlineBoardView },
    ],
  })
  await router.push(detail ? `/boards/${id}` : `/workspaces/${id}/boards`)
  await router.isReady()
  wrapper = mount(routed ? RouterView : detail ? OnlineBoardView : BoardsView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { pinia, router }
}
describe('online board UI', () => {
  it('creates a board and opens its route', async () => {
    api.create.mockResolvedValue(id)
    const { router } = await render()
    await wrapper!.get('#board-name').setValue('Website')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith(id, expect.any(String), 'Website')
    expect(router.currentRoute.value.path).toBe(`/boards/${id}`)
  })
  it('shows migration errors and preserves the entered name', async () => {
    api.create.mockRejectedValue({ code: 'PGRST202' })
    await render()
    await wrapper!.get('#board-name').setValue('Draft')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('202609300002')
    expect(
      (wrapper!.get('#board-name').element as HTMLInputElement).value,
    ).toBe('Draft')
  })
  it('hides write actions and disables status menus for Viewer', async () => {
    api.snapshot.mockResolvedValue(snapshot('viewer'))
    await render(true)
    expect(wrapper!.text()).toContain('chỉ có quyền xem')
    expect(wrapper!.text()).not.toContain('Tạo công việc')
    expect(wrapper!.find('#rename-board').exists()).toBe(false)
    expect(wrapper!.get(`#move-${taskId}`).attributes('disabled')).toBeDefined()
  })
  it('submits only the destination event for cross-column drag', async () => {
    api.mutate.mockResolvedValue({
      ...snapshot(),
      board: { ...board, version: 2 },
    })
    await render(true)
    const columns = wrapper!.findAllComponents({ name: 'draggable' })
    expect(columns.length).toBe(4)
    columns[0]!.vm.$emit('change', { removed: { element: task, oldIndex: 0 } })
    columns[1]!.vm.$emit('change', { added: { element: task, newIndex: 0 } })
    await flushPromises()
    expect(api.mutate).toHaveBeenCalledTimes(1)
    expect(api.mutate.mock.calls[0]!.slice(3)).toEqual([
      'move_task',
      { id: taskId, status: 'doing', position: 0 },
    ])
  })
  it('keeps controls and cards mounted while the polling timer awaits the server', async () => {
    const timer = vi.spyOn(globalThis, 'setInterval')
    let tick!: () => void
    try {
      await render(true)
      tick = timer.mock.calls.at(-1)![0] as () => void
    } finally {
      timer.mockRestore()
    }
    const input = wrapper!.get('#rename-board').element
    const card = wrapper!.get('.task-card').element
    let finish!: (value: unknown) => void
    api.snapshot.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    tick()
    await new Promise((resolve) => setTimeout(resolve, 220))
    await flushPromises()
    expect(wrapper!.text()).not.toContain('Đang tải board')
    expect(wrapper!.text()).toContain('Tạo công việc')
    expect(wrapper!.get('#rename-board').attributes('disabled')).toBeUndefined()
    expect(wrapper!.get('.task-card').element).toBe(card)
    finish(snapshot())
    await flushPromises()
    expect(wrapper!.get('#rename-board').element).toBe(input)
    expect(wrapper!.get('.task-card').element).toBe(card)
  })
  it('opens the exact task from its URL and reports unknown task links', async () => {
    const { router } = await render(true)
    await router.replace({ query: { task: taskId } })
    await flushPromises()
    expect(
      (document.querySelector('#online-task-title') as HTMLInputElement)?.value,
    ).toBe('Task A')
    const copyButton = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Sao chép link task'),
    )!
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    copyButton.click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('?task=' + taskId),
    )
    await router.replace({
      query: { task: '40000000-0000-4000-8000-000000000001' },
    })
    await flushPromises()
    expect(wrapper!.text()).toContain('Task không tồn tại trong board này')
  })
  it('keeps a new task draft open when a collaboration snapshot arrives', async () => {
    const { pinia } = await render(true)
    await wrapper!
      .findAll('button')
      .find((button) => button.text() === 'Tạo công việc')!
      .trigger('click')
    await flushPromises()
    const input = document.querySelector(
      '#online-task-title',
    ) as HTMLInputElement
    input.value = 'New unsaved task'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const store = useOnlineBoardStore(pinia)
    store.snapshot = { ...snapshot(), board: { ...board, version: 2 } } as any
    await flushPromises()
    expect(
      (document.querySelector('#online-task-title') as HTMLInputElement).value,
    ).toBe('New unsaved task')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Lưu công việc')
  })
  it('preserves a dirty board name and requires reconciliation after a new snapshot', async () => {
    const { pinia } = await render(true)
    await wrapper!.get('#rename-board').setValue('My draft name')
    const store = useOnlineBoardStore(pinia)
    store.snapshot = {
      ...snapshot(),
      board: { ...board, name: 'Someone else', version: 2 },
    } as any
    await flushPromises()
    expect(
      (wrapper!.get('#rename-board').element as HTMLInputElement).value,
    ).toBe('My draft name')
    expect(wrapper!.text()).toContain('Đã đối chiếu tên')
    expect(
      wrapper!.get('button[type="submit"]').attributes('disabled'),
    ).toBeDefined()
  })
  it('retains the task draft on conflict and requires explicit reconciliation', async () => {
    const pinia = createPinia()
    const store = useOnlineBoardStore(pinia)
    store.snapshot = snapshot() as any
    wrapper = mount(OnlineTaskDialog, {
      props: { open: false, task: null, status: 'todo' },
      global: {
        plugins: [pinia],
        stubs: {
          Dialog: { template: '<div><slot /></div>' },
          DialogContent: { template: '<div><slot /></div>' },
          DialogHeader: { template: '<div><slot /></div>' },
          DialogTitle: { template: '<div><slot /></div>' },
          DialogDescription: { template: '<div><slot /></div>' },
          DialogFooter: { template: '<div><slot /></div>' },
        },
      },
    })
    await wrapper.setProps({ open: true })
    await wrapper.get('#online-task-title').setValue('Keep draft')
    api.mutate.mockRejectedValue({ code: 'PT409', message: 'BOARD_CONFLICT' })
    api.snapshot.mockResolvedValue({
      ...snapshot(),
      board: { ...board, version: 2 },
    })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(
      (wrapper.get('#online-task-title').element as HTMLInputElement).value,
    ).toBe('Keep draft')
    expect(wrapper.text()).toContain('Giữ bản nháp để lưu')
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })
})

describe('task draft protection', () => {
  async function openTask() {
    const pinia = createPinia()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/boards/:boardId', component: OnlineBoardView },
        {
          path: '/workspaces',
          component: { template: '<div>Workspaces</div>' },
        },
      ],
    })
    await router.push(`/boards/${id}?task=${taskId}`)
    await router.isReady()
    wrapper = mount(
      { template: '<router-view />' },
      { global: { plugins: [pinia, router] } },
    )
    await flushPromises()
    return { router, pinia }
  }
  function button(label: string) {
    const element = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    )
    expect(element).toBeTruthy()
    element!.click()
  }
  async function editTitle(value: string) {
    const input = document.querySelector(
      '#online-task-title',
    ) as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }
  it('keeps a draft when canceling dismissal and closes only after discard', async () => {
    await openTask()
    await editTitle('Unsaved task')
    button('Đóng')
    await flushPromises()
    expect(document.body.textContent).toContain('Bỏ thay đổi chưa lưu?')
    button('Tiếp tục chỉnh sửa')
    await flushPromises()
    expect(
      (document.querySelector('#online-task-title') as HTMLInputElement).value,
    ).toBe('Unsaved task')
    button('Đóng')
    await flushPromises()
    button('Bỏ thay đổi')
    await flushPromises()
    expect(document.querySelector('#online-task-title')).toBeNull()
    expect(api.mutate).not.toHaveBeenCalled()
  })
  it('blocks route navigation until the user decides what to do with the draft', async () => {
    const { router } = await openTask()
    await editTitle('Stay here')
    const navigation = router.push('/workspaces')
    await flushPromises()
    expect(document.body.textContent).toContain('Bỏ thay đổi chưa lưu?')
    button('Tiếp tục chỉnh sửa')
    await navigation
    expect(router.currentRoute.value.path).toBe(`/boards/${id}`)
  })
  it('shows server and draft values and can adopt the latest task', async () => {
    const { pinia } = await openTask()
    await editTitle('My draft')
    const store = useOnlineBoardStore(pinia)
    store.snapshot = {
      ...snapshot(),
      board: { ...board, version: 2 },
      tasks: [{ ...task, title: 'Server title' }],
    } as any
    // The mocked server must reflect the remote update too: the initial
    // collaboration refresh can finish after this assertion's setup.
    api.snapshot.mockResolvedValue(store.snapshot)
    await flushPromises()
    expect(document.body.textContent).toContain('Hiện tại: Server title')
    expect(document.body.textContent).toContain('Bản nháp: My draft')
    button('Dùng bản hiện tại')
    await flushPromises()
    expect(
      (document.querySelector('#online-task-title') as HTMLInputElement).value,
    ).toBe('Server title')
  })
})

it('blocks navigation and warns on reload while a board write is uncertain, even with no task dialog', async () => {
  const { pinia, router } = await render(true, true)
  const store = useOnlineBoardStore(pinia)
  api.mutate.mockRejectedValueOnce(new Error('lost response'))
  await store.mutate('rename', { name: 'New' })
  await flushPromises()
  expect(wrapper!.find('[data-sync-state="uncertain"]').exists()).toBe(true)
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  await router.push(`/workspaces/${id}/boards`)
  expect(router.currentRoute.value.path).toBe(`/boards/${id}`)
  api.mutate.mockResolvedValue(snapshot())
  await store.retry()
  await router.push(`/workspaces/${id}/boards`)
  expect(router.currentRoute.value.path).toBe(`/workspaces/${id}/boards`)
})
it('opens a task through its card with the sync route guards active', async () => {
  const { router } = await render(true, true)
  await wrapper!
    .findAll('button')
    .find((b) => b.text() === 'Task A')!
    .trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query.task).toBe(taskId)
  expect(document.querySelector('#online-task-title')).not.toBeNull()
})
