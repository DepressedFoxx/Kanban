import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { workspaceApi } from '@/features/workspaces/api'
import {
  workspaceError,
  type Workspace,
  type Member,
  type Invitation,
} from '@/features/workspaces/model'
export const useWorkspaceStore = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>([])
  const current = ref<Workspace | null>(null)
  const members = ref<Member[]>([])
  const invitations = ref<Invitation[]>([])
  const peoplePage = ref({ page: 1, pageSize: 20, total: 0, search: '' })
  const invitesPage = ref({ page: 1, pageSize: 20, total: 0, search: '' })
  const paged = ref(false)
  const loading = ref(false)
  const pending = ref(false)
  const error = ref('')
  const notice = ref('')
  const owner = computed(() => current.value?.role === 'owner')
  let generation = 0
  function clear() {
    generation++
    workspaces.value = []
    current.value = null
    members.value = []
    invitations.value = []
    peoplePage.value = { page: 1, pageSize: 20, total: 0, search: '' }
    invitesPage.value = { page: 1, pageSize: 20, total: 0, search: '' }
    paged.value = false
    loading.value = false
    pending.value = false
    error.value = ''
    notice.value = ''
  }
  async function load(id?: string) {
    const request = ++generation
    loading.value = true
    error.value = ''
    if (current.value?.id !== id) {
      current.value = null
      members.value = []
      invitations.value = []
    }
    try {
      const list = id ? [await workspaceApi.get(id)] : await workspaceApi.list()
      if (request !== generation) return false
      workspaces.value = list
      if (id) {
        const item = list.find((w) => w.id === id)
        if (!item) throw { message: 'WORKSPACE_ACCESS_DENIED' }
        const [people, invites] = await Promise.all([
          paged.value
            ? workspaceApi.memberPage(
                id,
                peoplePage.value.page,
                peoplePage.value.pageSize,
                peoplePage.value.search,
              )
            : workspaceApi.members(id),
          item.role === 'owner'
            ? paged.value
              ? workspaceApi.invitationPage(
                  id,
                  invitesPage.value.page,
                  invitesPage.value.pageSize,
                  invitesPage.value.search,
                )
              : workspaceApi.invitations(id)
            : Promise.resolve([]),
        ])
        if (request !== generation) return false
        current.value = item
        members.value = paged.value ? people.items : people
        invitations.value =
          paged.value && item.role === 'owner' ? invites.items : invites
        if (paged.value) {
          peoplePage.value = {
            ...peoplePage.value,
            page: people.page,
            total: people.total,
          }
          if (item.role === 'owner')
            invitesPage.value = {
              ...invitesPage.value,
              page: invites.page,
              total: invites.total,
            }
        }
      }
      return true
    } catch (cause) {
      if (request === generation) {
        error.value = workspaceError(cause)
        workspaces.value = []
        current.value = null
        members.value = []
        invitations.value = []
      }
      return false
    } finally {
      if (request === generation) loading.value = false
    }
  }
  async function mutate<T>(
    action: () => Promise<T>,
  ): Promise<{ value: T } | null> {
    if (pending.value || loading.value) return null
    const request = generation
    pending.value = true
    error.value = ''
    notice.value = ''
    try {
      const value = await action()
      if (request !== generation) return null
      return { value }
    } catch (cause) {
      if (request === generation) {
        error.value = workspaceError(cause)
        // A denied write invalidates cached permissions immediately.
        if ((cause as { code?: string })?.code === '42501') {
          current.value = null
          members.value = []
          invitations.value = []
          workspaces.value = []
        }
      }
      return null
    } finally {
      if (request === generation) pending.value = false
    }
  }
  return {
    workspaces,
    current,
    members,
    paged,
    peoplePage,
    invitesPage,
    invitations,
    loading,
    pending,
    error,
    notice,
    owner,
    clear,
    load,
    mutate,
  }
})
