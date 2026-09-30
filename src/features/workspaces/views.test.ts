// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import WorkspacesView from './views/WorkspacesView.vue'
import MembersView from './views/MembersView.vue'
const api = vi.hoisted(() => ({
  list: vi.fn(),
  members: vi.fn(),
  invitations: vi.fn(),
  create: vi.fn(),
  invite: vi.fn(),
  rename: vi.fn(),
}))
vi.mock('./api', () => ({ workspaceApi: api }))
const id = '10000000-0000-4000-8000-000000000001'
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.resetAllMocks()
  api.list.mockResolvedValue([
    { id, name: 'Workspace A', role: 'owner', created_at: '2026-09-29' },
  ])
  api.members.mockResolvedValue([
    {
      user_id: id,
      display_name: 'An',
      email: 'an@example.com',
      role: 'owner',
      joined_at: '2026-09-29',
    },
  ])
  api.invitations.mockResolvedValue([])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})
async function render(detail = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workspaces', component: WorkspacesView },
      { path: '/workspaces/:workspaceId/members', component: MembersView },
    ],
  })
  await router.push(detail ? '/workspaces/' + id + '/members' : '/workspaces')
  await router.isReady()
  wrapper = mount(detail ? MembersView : WorkspacesView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  return router
}
describe('workspace UI', () => {
  it('creates a workspace and navigates to its members', async () => {
    api.create.mockResolvedValue(id)
    const router = await render()
    await wrapper!.get('#workspace-name').setValue('My team')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith('My team')
    expect(router.currentRoute.value.path).toBe(
      '/workspaces/' + id + '/members',
    )
  })
  it('retains the entered name and exposes server errors', async () => {
    api.create.mockRejectedValue({ code: 'PGRST202' })
    await render()
    await wrapper!.get('#workspace-name').setValue('Keep draft')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(
      (wrapper!.get('#workspace-name').element as HTMLInputElement).value,
    ).toBe('Keep draft')
    expect(wrapper!.get('[role="alert"]').text()).toContain(
      'chưa được thiết lập',
    )
  })
  it('shows member list but no management forms to viewers', async () => {
    api.list.mockResolvedValue([
      { id, name: 'Workspace A', role: 'viewer', created_at: '2026-09-29' },
    ])
    await render(true)
    expect(wrapper!.text()).toContain('an@example.com')
    expect(wrapper!.find('#invite-email').exists()).toBe(false)
    expect(wrapper!.find('#rename-workspace').exists()).toBe(false)
  })
  it('generates a copyable invitation link for owners', async () => {
    api.invite.mockResolvedValue('a'.repeat(64))
    await render(true)
    await wrapper!.get('#invite-email').setValue('member@example.com')
    await wrapper!.findAll('form')[1]!.trigger('submit')
    await flushPromises()
    expect(api.invite).toHaveBeenCalledWith(id, 'member@example.com', 'member')
    expect(
      (wrapper!.get('#invite-link').element as HTMLInputElement).value,
    ).toContain('/invite/' + 'a'.repeat(64))
  })
})
