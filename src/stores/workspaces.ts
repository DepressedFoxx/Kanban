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
    loading.value = false
    pending.value = false
    error.value = ''
    notice.value = ''
  }
  async function load(id?: string) {
    const request = ++generation
    loading.value = true
    error.value = ''
    current.value = null
    members.value = []
    invitations.value = []
    try {
      const list = await workspaceApi.list()
      if (request !== generation) return false
      workspaces.value = list
      if (id) {
        const item = list.find((w) => w.id === id)
        if (!item) throw { message: 'WORKSPACE_ACCESS_DENIED' }
        const [people, invites] = await Promise.all([
          workspaceApi.members(id),
          item.role === 'owner'
            ? workspaceApi.invitations(id)
            : Promise.resolve([]),
        ])
        if (request !== generation) return false
        current.value = item
        members.value = people
        invitations.value = invites
      }
      return true
    } catch (cause) {
      if (request === generation) {
        error.value = workspaceError(cause)
        workspaces.value = []
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
