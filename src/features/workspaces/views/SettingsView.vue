<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import PageHeader from '@/components/PageHeader.vue'
import { useWorkspaceSettingsStore } from '@/stores/workspaceSettings'
import { workspaceApi } from '../api'
import { type Member } from '../model'
import { useCollab } from '@/features/collab/useCollab'
const store = useWorkspaceSettingsStore(),
  route = useRoute(),
  router = useRouter()
const id = computed(() => String(route.params.workspaceId))
const name = ref(''),
  description = ref(''),
  timezone = ref(''),
  baseVersion = ref(0),
  base = ref('')
const members = ref<Member[]>([]),
  confirmation = ref(''),
  target = ref(''),
  action = ref('')
let leaveDecision: ((allow: boolean) => void) | undefined
function closeConfirmation(value: boolean) {
  if (!value && !disabled.value) {
    action.value = ''
    leaveDecision?.(false)
    leaveDecision = undefined
  }
}
const currentForm = () =>
  JSON.stringify([name.value, description.value, timezone.value])
const dirty = computed(() => currentForm() !== base.value)
const conflict = computed(
  () => dirty.value && store.snapshot?.version !== baseVersion.value,
)
function adopt() {
  const s = store.snapshot
  if (s) {
    name.value = s.name
    description.value = s.description
    timezone.value = s.timezone
    baseVersion.value = s.version
    base.value = currentForm()
  }
}
watch(
  () => store.snapshot,
  (s) => {
    if (s && (!base.value || !dirty.value)) adopt()
    if (!s) members.value = []
  },
)
watch(
  () => [store.snapshot?.id, store.snapshot?.version],
  async () => {
    const value = store.snapshot
    if (!value) return
    try {
      const people = await workspaceApi.members(value.id)
      if (
        store.snapshot?.id === value.id &&
        store.snapshot.version === value.version
      )
        members.value = people
    } catch {
      /* Role/access errors are handled by the settings snapshot refresh. */
    }
  },
)
function actorName(user: unknown) {
  if (typeof user !== 'string') return 'Tài khoản đã xóa'
  const person = members.value.find((member) => member.user_id === user)
  return (
    person?.display_name || person?.email || `Thành viên ${user.slice(0, 8)}`
  )
}
watch(
  id,
  async (value) => {
    store.clear()
    base.value = ''
    members.value = []
    await store.load(value)
  },
  { immediate: true },
)
const { online } = useCollab(
  () => [{ table: 'workspaces', event: 'UPDATE', filter: `id=eq.${id.value}` }],
  () => store.load(id.value),
  () => !!store.snapshot,
)
const disabled = computed(
  () => store.pending || !!store.uncertain || !online.value,
)
async function refreshAfterFailure() {
  const message = store.error
  await store.load(id.value)
  if (!store.error) store.error = message
}
async function save() {
  try {
    new Intl.DateTimeFormat('vi-VN', { timeZone: timezone.value }).format(
      new Date(),
    )
  } catch {
    store.error =
      'Múi giờ không được trình duyệt hỗ trợ. Chọn IANA timezone hợp lệ.'
    return
  }
  if (
    await store.mutate(
      'update',
      {
        name: name.value,
        description: description.value,
        timezone: timezone.value,
      },
      baseVersion.value,
    )
  ) {
    base.value = currentForm()
    await store.load(id.value)
    adopt()
  } else if (!store.uncertain) await refreshAfterFailure()
}
async function ask(kind: string) {
  action.value = kind
  confirmation.value = ''
  target.value = ''
  if (kind === 'transfer') {
    try {
      members.value = await workspaceApi.members(id.value)
    } catch {
      store.error = 'Không tải được thành viên. Hãy thử lại.'
      action.value = ''
    }
  }
}
async function finish(kind: string, success: boolean) {
  if (success) {
    action.value = ''
    if (kind === 'leave') {
      base.value = currentForm()
      await router.push('/workspaces')
    } else {
      await store.load(id.value)
      adopt()
    }
  } else if (!store.uncertain) await refreshAfterFailure()
}
async function execute() {
  if (action.value === 'discard') {
    const resolve = leaveDecision
    leaveDecision = undefined
    action.value = ''
    resolve?.(true)
    return
  }
  if (!store.snapshot) return
  const kind = action.value
  await finish(
    kind,
    await store.mutate(
      kind,
      kind === 'transfer' ? { user_id: target.value } : {},
      store.snapshot!.version,
    ),
  )
}
async function retry() {
  const kind = store.uncertain?.action ?? ''
  await finish(kind, await store.retry())
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || store.pending || store.uncertain) {
    e.preventDefault()
    e.returnValue = ''
  }
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeRouteLeave(() => {
  if (store.pending || store.uncertain) {
    store.error = 'Hãy xác nhận thao tác đang chờ trước khi rời trang.'
    return false
  }
  if (!dirty.value) return true
  return new Promise<boolean>((resolve) => {
    leaveDecision = resolve
    action.value = 'discard'
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  store.clear()
})
const labels: Record<string, string> = {
  discard: 'Bỏ thay đổi chưa lưu?',
  update: 'Cập nhật settings',
  transfer: 'Chuyển Owner',
  leave: 'Rời workspace',
  archive: 'Lưu trữ workspace',
  restore: 'Khôi phục workspace',
  rename: 'Đổi tên',
  member_role: 'Đổi vai trò',
  member_removed: 'Gỡ thành viên',
  invited: 'Tạo lời mời',
  invite_revoked: 'Thu hồi lời mời',
  member_joined: 'Tham gia workspace',
}
</script>
<template>
  <main class="workspace-page">
    <RouterLink to="/workspaces" class="text-sm text-primary"
      >← Workspace</RouterLink
    >
    <PageHeader title="Cài đặt workspace" :description="store.snapshot?.name"
      ><Button
        variant="outline"
        class="transition-none"
        :disabled="disabled || store.loading"
        @click="store.load(id)"
        >Tải lại</Button
      ></PageHeader
    >
    <p v-if="store.error" role="alert" class="mt-4 text-destructive">
      {{ store.error }}
    </p>
    <p v-if="store.notice" role="status" class="mt-4">{{ store.notice }}</p>
    <p v-if="store.loading && !store.snapshot" role="status">
      Đang tải settings…
    </p>
    <Button
      v-if="store.uncertain"
      class="mt-4"
      :disabled="store.pending || !online"
      @click="retry"
      >Xác nhận lại thao tác</Button
    >
    <template v-if="store.snapshot">
      <p
        v-if="store.snapshot.archived_at"
        role="status"
        class="mt-4 rounded-lg border p-4"
      >
        Workspace đã lưu trữ. Nội dung chỉ đọc; Owner có thể khôi phục.
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <Button as-child variant="outline"
          ><RouterLink :to="`/workspaces/${id}/boards`"
            >Board</RouterLink
          ></Button
        ><Button as-child variant="outline"
          ><RouterLink :to="`/workspaces/${id}/members`"
            >Thành viên và lời mời</RouterLink
          ></Button
        >
      </div>
      <form
        class="mt-6 grid max-w-2xl gap-4 rounded-xl border bg-card p-5"
        @submit.prevent="save"
      >
        <h2 class="text-lg font-semibold">Thông tin chung</h2>
        <fieldset
          class="grid gap-4"
          :disabled="!store.owner || !!store.snapshot.archived_at || disabled"
        >
          <div class="field">
            <Label for="settings-name">Tên workspace</Label
            ><Input id="settings-name" v-model="name" required maxlength="80" />
          </div>
          <div class="field">
            <Label for="settings-description">Mô tả</Label
            ><Textarea
              id="settings-description"
              v-model="description"
              maxlength="1000"
            />
          </div>
          <div class="field">
            <Label for="settings-timezone">Múi giờ IANA</Label
            ><Input
              id="settings-timezone"
              v-model="timezone"
              required
              placeholder="Asia/Bangkok"
              aria-describedby="timezone-help"
            />
            <p id="timezone-help" class="text-sm text-muted-foreground">
              Ví dụ Asia/Bangkok, Asia/Ho_Chi_Minh, UTC. Đổi múi giờ thay đổi
              cách tính hôm nay/quá hạn, không đổi ngày hạn đã nhập.
            </p>
          </div>
        </fieldset>
        <p v-if="!store.owner" class="text-sm text-muted-foreground">
          Chỉ Owner được sửa settings.
        </p>
        <div v-if="conflict" role="status">
          <p>Workspace đã thay đổi. Bản nháp của bạn được giữ lại.</p>
          <Button
            type="button"
            variant="outline"
            :disabled="disabled"
            @click="adopt"
            >Dùng bản hiện tại</Button
          >
        </div>
        <Button
          v-if="store.owner && !store.snapshot.archived_at"
          class="transition-none"
          type="submit"
          :disabled="disabled || store.loading || conflict || !dirty"
          >Lưu cài đặt</Button
        >
      </form>
      <section class="mt-6 max-w-2xl rounded-xl border bg-card p-5">
        <h2 class="text-lg font-semibold">Quyền sở hữu và vòng đời</h2>
        <div class="mt-4 flex flex-wrap gap-3">
          <template v-if="store.owner"
            ><Button
              variant="outline"
              :disabled="disabled || dirty"
              @click="ask('transfer')"
              >Chuyển Owner</Button
            ><Button
              variant="outline"
              :disabled="disabled || dirty"
              @click="ask(store.snapshot.archived_at ? 'restore' : 'archive')"
              >{{
                store.snapshot.archived_at
                  ? 'Khôi phục workspace'
                  : 'Lưu trữ workspace'
              }}</Button
            >
            <p class="w-full text-sm text-muted-foreground">
              Owner cần chuyển quyền trước khi rời workspace.
            </p></template
          >
          <Button
            v-else
            variant="destructive"
            :disabled="disabled"
            @click="ask('leave')"
            >Rời workspace</Button
          >
        </div>
      </section>
      <section v-if="store.owner" class="mt-6 max-w-2xl">
        <h2 class="text-lg font-semibold">Lịch sử quản trị</h2>
        <p v-if="!store.activity.length" class="mt-3 text-sm">
          Chưa có hoạt động quản trị từ khi bật Settings.
        </p>
        <ol class="mt-3 space-y-3">
          <li
            v-for="event in store.activity"
            :key="event.id"
            class="rounded-lg border p-3"
          >
            <p>{{ labels[event.action] ?? event.action }}</p>
            <p class="text-xs text-muted-foreground">
              {{ new Date(event.created_at).toLocaleString('vi-VN') }} ·
              {{ actorName(event.actor_id) }}
            </p>
            <p v-if="event.changes.user_id" class="mt-1 text-sm">
              Thành viên: {{ actorName(event.changes.user_id)
              }}<span v-if="event.changes.role">
                · {{ event.changes.role }}</span
              >
            </p>
          </li>
        </ol>
        <Button
          v-if="store.more"
          variant="outline"
          :disabled="store.loading"
          class="mt-3"
          @click="store.older"
          >Hoạt động cũ hơn</Button
        >
      </section>
    </template>
    <AlertDialog :open="!!action" @update:open="closeConfirmation"
      ><AlertDialogContent
        ><AlertDialogHeader
          ><AlertDialogTitle>{{ labels[action] }}</AlertDialogTitle
          ><AlertDialogDescription>{{
            action === 'discard'
              ? 'Bản nháp cài đặt sẽ bị bỏ khi rời trang.'
              : action === 'transfer'
                ? 'Bạn sẽ trở thành Member; người được chọn trở thành Owner.'
                : action === 'leave'
                  ? 'Bạn mất quyền truy cập và task được bỏ assignment. Nội dung đã tạo được giữ lại.'
                  : action === 'archive'
                    ? 'Nội dung chuyển sang chỉ đọc; lời mời đang chờ bị thu hồi.'
                    : 'Khôi phục quyền ghi workspace. Board đã lưu trữ và lời mời cũ không tự khôi phục.'
          }}</AlertDialogDescription></AlertDialogHeader
        >
        <div v-if="action === 'transfer'" class="field">
          <Label for="new-owner">Owner mới</Label
          ><Select v-model="target" :disabled="disabled"
            ><SelectTrigger id="new-owner"
              ><SelectValue placeholder="Chọn thành viên" /></SelectTrigger
            ><SelectContent
              ><SelectItem
                v-for="member in members.filter((m) => m.role !== 'owner')"
                :key="member.user_id"
                :value="member.user_id"
                >{{ member.display_name || member.email }}</SelectItem
              ></SelectContent
            ></Select
          >
        </div>
        <div v-if="action === 'archive'" class="field">
          <Label for="confirm-workspace">Nhập tên workspace để xác nhận</Label
          ><Input
            id="confirm-workspace"
            v-model="confirmation"
            :disabled="disabled"
          />
        </div>
        <p v-if="store.error" role="alert" class="text-sm text-destructive">
          {{ store.error }}
        </p>
        <AlertDialogFooter
          ><AlertDialogCancel :disabled="disabled">Hủy</AlertDialogCancel
          ><Button
            v-if="store.uncertain"
            :disabled="store.pending || !online"
            @click="retry"
            >Xác nhận lại thao tác</Button
          ><Button
            v-else
            :disabled="
              disabled ||
              (action === 'transfer' && !target) ||
              (action === 'archive' && confirmation !== store.snapshot?.name)
            "
            @click="execute"
            >Xác nhận</Button
          ></AlertDialogFooter
        >
      </AlertDialogContent></AlertDialog
    >
  </main>
</template>
