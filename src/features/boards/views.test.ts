// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
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
async function render(detail = false) {
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
  wrapper = mount(detail ? OnlineBoardView : BoardsView, {
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
    api.mutate.mockRejectedValue({ code: '40001', message: 'BOARD_CONFLICT' })
    api.snapshot.mockResolvedValue({
      ...snapshot(),
      board: { ...board, version: 2 },
    })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(
      (wrapper.get('#online-task-title').element as HTMLInputElement).value,
    ).toBe('Keep draft')
    expect(wrapper.text()).toContain('Đã đối chiếu')
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })
})
