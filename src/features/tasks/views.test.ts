// @vitest-environment jsdom
vi.mock('@/lib/supabase', () => ({ supabase: null }))
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import TaskThread from './TaskThread.vue'
const api = vi.hoisted(() => ({ thread: vi.fn(), comment: vi.fn() }))
vi.mock('./api', () => ({ tasksApi: api }))
const board = '20000000-0000-4000-8000-000000000001',
  task = '30000000-0000-4000-8000-000000000001'
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.resetAllMocks()
  api.thread.mockResolvedValue({
    can_comment: true,
    comments: [],
    activity: [],
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
async function render(readOnly = false) {
  wrapper = mount(TaskThread, {
    props: { board, task, readOnly },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
}
describe('task discussion UI', () => {
  it('renders comment content as plain text, never HTML', async () => {
    api.thread.mockResolvedValue({
      can_comment: false,
      activity: [],
      comments: [
        {
          id: task,
          actor_id: board,
          actor_name: 'An',
          body: '<img src=x onerror=alert(1)>',
          created_at: '2026-09-30T01:00:00Z',
        },
      ],
    })
    await render(true)
    expect(wrapper!.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.find('#task-comment').exists()).toBe(false)
  })
  it('keeps drafts after server errors and clears only after confirmed send', async () => {
    await render()
    api.comment
      .mockRejectedValueOnce({ code: '22023', message: 'INVALID_INPUT' })
      .mockResolvedValueOnce({ can_comment: true, comments: [], activity: [] })
    await wrapper!.get('#task-comment').setValue('My draft')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(
      (wrapper!.get('#task-comment').element as HTMLTextAreaElement).value,
    ).toBe('My draft')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(
      (wrapper!.get('#task-comment').element as HTMLTextAreaElement).value,
    ).toBe('')
  })
  it('shows before/after field changes with actor and timestamp', async () => {
    api.thread.mockResolvedValue({
      can_comment: false,
      comments: [],
      activity: [
        {
          id: '1',
          actor_id: board,
          actor_name: 'An',
          action: 'updated',
          changes: { status: { before: 'todo', after: 'doing' } },
          created_at: '2026-09-30T01:00:00Z',
        },
      ],
    })
    await render(true)
    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'Lịch sử')!
      .trigger('click')
    expect(wrapper!.text()).toContain('An đã cập nhật công việc')
    expect(wrapper!.text()).toContain('Cần làm → Đang làm')
  })
})
