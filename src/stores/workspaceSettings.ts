import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  settingsApi,
  type WorkspaceSettings,
  type WorkspaceActivity,
  type SettingsMutation,
} from '@/features/workspaces/settings'
import { workspaceError } from '@/features/workspaces/model'
import {
  isAccessDenied,
  isDefinitiveFailure,
  isOffline,
} from '@/features/sync/request'
export const useWorkspaceSettingsStore = defineStore(
  'workspace-settings',
  () => {
    const snapshot = ref<WorkspaceSettings | null>(null),
      activity = ref<WorkspaceActivity[]>([])
    const loading = ref(false),
      pending = ref(false),
      error = ref(''),
      notice = ref(''),
      uncertain = ref<SettingsMutation | null>(null)
    const more = ref(false)
    let generation = 0
    const owner = computed(() => snapshot.value?.role === 'owner')
    function clear() {
      generation++
      snapshot.value = null
      activity.value = []
      loading.value = false
      pending.value = false
      error.value = ''
      notice.value = ''
      uncertain.value = null
      more.value = false
    }
    async function load(id: string) {
      if (pending.value || loading.value || uncertain.value) return false
      const current = ++generation
      loading.value = true
      if (snapshot.value?.id !== id) {
        snapshot.value = null
        activity.value = []
      }
      try {
        const value = await settingsApi.get(id)
        const logs =
          value.role === 'owner' ? await settingsApi.activity(id) : []
        if (current !== generation) return false
        snapshot.value = value
        activity.value = logs
        more.value = logs.length === 50
        error.value = ''
        return true
      } catch (cause) {
        if (current === generation) {
          error.value = workspaceError(cause)
          if (isAccessDenied(cause)) {
            snapshot.value = null
            activity.value = []
          }
        }
        return false
      } finally {
        if (current === generation) loading.value = false
      }
    }
    async function send(m: SettingsMutation) {
      if (pending.value || isOffline()) {
        error.value =
          'Đang offline hoặc đang xử lý. Hãy thử lại khi kết nối ổn định.'
        return false
      }
      const current = ++generation
      pending.value = true
      loading.value = false
      error.value = ''
      notice.value = ''
      try {
        await settingsApi.mutate(m)
        if (current !== generation) return false
        uncertain.value = null
        notice.value = 'Đã xác nhận thao tác.'
        if (m.action === 'leave') {
          snapshot.value = null
          activity.value = []
        }
        return true
      } catch (cause) {
        if (current === generation) {
          error.value = workspaceError(cause)
          uncertain.value = isDefinitiveFailure(cause) ? null : m
          if (isAccessDenied(cause)) {
            snapshot.value = null
            activity.value = []
          }
        }
        return false
      } finally {
        if (current === generation) pending.value = false
      }
    }
    async function mutate(
      action: string,
      data: Record<string, unknown>,
      version: number,
    ) {
      if (!snapshot.value || uncertain.value || loading.value) return false
      return send({
        workspace: snapshot.value.id,
        version,
        id: crypto.randomUUID(),
        action,
        data: JSON.parse(JSON.stringify(data)),
      })
    }
    async function retry() {
      return uncertain.value ? send(uncertain.value) : false
    }
    async function older() {
      if (!snapshot.value || !owner.value || loading.value || !more.value)
        return
      const current = generation
      loading.value = true
      try {
        const rows = await settingsApi.activity(
          snapshot.value.id,
          activity.value.at(-1)?.id,
        )
        if (current === generation) {
          activity.value.push(...rows)
          more.value = rows.length === 50
        }
      } catch (cause) {
        if (current === generation) error.value = workspaceError(cause)
      } finally {
        if (current === generation) loading.value = false
      }
    }
    return {
      snapshot,
      activity,
      loading,
      pending,
      error,
      notice,
      uncertain,
      more,
      owner,
      clear,
      load,
      mutate,
      retry,
      older,
    }
  },
)
