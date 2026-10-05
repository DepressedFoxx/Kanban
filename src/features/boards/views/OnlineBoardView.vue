<script setup lang="ts">
import { useCollab } from '@/features/collab/useCollab'
import PageHeader from '@/components/PageHeader.vue'
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import SyncStatus from '@/features/sync/SyncStatus.vue'
import {
  RouterLink,
  useRoute,
  useRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
} from 'vue-router'
import draggable from 'vuedraggable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import TaskCard from '@/components/board/TaskCard.vue'
import LabelManager from '@/features/tasks/LabelManager.vue'
import BulkTasks from '@/features/tasks/BulkTasks.vue'
import OnlineTaskDialog from '../OnlineTaskDialog.vue'
import {
  columns,
  priorities,
  priorityLabels,
  type Status,
} from '@/features/board/config'
import { appConfig } from '@/config/app'
import { boardConfig, type OnlineTask } from '../model'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { isMyTasksPath } from '@/features/my-tasks/model'
const router = useRouter()
const taskLinkError = ref('')
const route = useRoute(),
  store = useOnlineBoardStore(),
  id = String(route.params.boardId)
const query = ref(''),
  priority = ref('all'),
  assignee = ref('all'),
  showArchive = ref(false),
  name = ref('')
const nameVersion = ref(0)
const open = ref(false),
  selected = ref<OnlineTask | null>(null),
  initial = ref<Status>('todo'),
  dragging = ref(false)

const { online, label: collabLabel } = useCollab(
  () => [
    {
      table: 'workspaces',
      event: 'UPDATE',
      filter: `id=eq.${store.snapshot?.board.workspace_id}`,
    },
    { table: 'boards', event: 'UPDATE', filter: `id=eq.${id}` },
    {
      table: 'workspace_members',
      event: 'INSERT',
      filter: `workspace_id=eq.${store.snapshot?.board.workspace_id}`,
    },
    {
      table: 'workspace_members',
      event: 'UPDATE',
      filter: `workspace_id=eq.${store.snapshot?.board.workspace_id}`,
    },
  ],
  () => (dragging.value ? Promise.resolve(false) : refresh(true)),
  () => Boolean(store.snapshot),
)
const canWrite = computed(() => store.writable && online.value)
const filtered = computed(() =>
  Boolean(
    query.value.trim() || priority.value !== 'all' || assignee.value !== 'all',
  ),
)
const active = computed(
  () => store.snapshot?.tasks.filter((t) => !t.archived_at) ?? [],
)
const archived = computed(
  () => store.snapshot?.tasks.filter((t) => t.archived_at) ?? [],
)
function memberName(user: string | null) {
  const member = store.snapshot?.members.find((m) => m.user_id === user)
  return member?.display_name || member?.email || ''
}
function matches(task: OnlineTask) {
  return (
    `${task.title} ${task.description} ${memberName(task.assignee_id)}`
      .toLocaleLowerCase('vi')
      .includes(query.value.trim().toLocaleLowerCase('vi')) &&
    (priority.value === 'all' || task.priority === priority.value) &&
    (assignee.value === 'all' ||
      (assignee.value === 'none'
        ? !task.assignee_id
        : task.assignee_id === assignee.value))
  )
}
function cards(status: Status) {
  return active.value.filter((t) => t.status === status && matches(t))
}
function displayTask(task: OnlineTask) {
  return {
    ...task,
    assignee: memberName(task.assignee_id),
    dueDate: task.due_date ?? '',
  }
}
async function add(status: Status = 'todo') {
  if (route.query.task)
    await router.replace({
      query: isMyTasksPath(route.query.returnTo)
        ? { returnTo: route.query.returnTo }
        : {},
    })
  selected.value = null
  initial.value = status
  open.value = true
}
function edit(task: OnlineTask) {
  void router.replace({ query: { ...route.query, task: task.id } })
}
function setDialogOpen(value: boolean) {
  open.value = value
  if (!value && route.query.task)
    void router.replace({
      query: isMyTasksPath(route.query.returnTo)
        ? { returnTo: route.query.returnTo }
        : {},
    })
}
watch(
  [() => route.query.task, () => store.snapshot?.board.id],
  () => {
    taskLinkError.value = ''
    const taskId = route.query.task
    if (!taskId) {
      open.value = false
      return
    }
    if (!store.snapshot) return
    const found =
      typeof taskId === 'string'
        ? store.snapshot.tasks.find((t) => t.id === taskId)
        : undefined
    if (!found) {
      open.value = false
      taskLinkError.value =
        'Task không tồn tại trong board này hoặc đường dẫn không hợp lệ.'
      return
    }
    selected.value = found
    open.value = true
  },
  { immediate: true },
)
async function refresh(background = false) {
  if (!store.pending && !store.uncertain) {
    const previousName = store.snapshot?.board.name
    const loaded = await store.load(id, { background })
    if (!loaded) return false
    if (!previousName || name.value === previousName) {
      name.value = store.snapshot?.board.name ?? ''
      nameVersion.value = store.snapshot?.board.version ?? 0
    }
    return true
  }
  return false
}
async function rename() {
  if (await store.mutate('rename', { name: name.value }, nameVersion.value))
    nameVersion.value = store.snapshot?.board.version ?? 0
}
function clearFilters() {
  query.value = ''
  priority.value = 'all'
  assignee.value = 'all'
}
async function move(taskId: string, status: Status, position?: number) {
  if (!canWrite.value) return
  await store.mutate('move_task', {
    id: taskId,
    status,
    position:
      position ??
      active.value.filter((t) => t.status === status && t.id !== taskId).length,
  })
}
function dragged(
  status: Status,
  event: {
    added?: { element: OnlineTask; newIndex: number }
    moved?: { element: OnlineTask; newIndex: number }
  },
) {
  const change = event.added ?? event.moved
  if (change && !filtered.value)
    void move(change.element.id, status, change.newIndex)
}
watch(
  () => store.snapshot,
  (value) => {
    if (value && name.value === value.board.name)
      nameVersion.value = value.board.version
    if (!value) {
      open.value = false
      selected.value = null
    }
  },
)
function guardSync() {
  if (!store.pending && !store.uncertain) return true
  store.error = 'Hãy xác nhận xong thao tác đang lưu trước khi rời board.'
  return false
}
onBeforeRouteLeave(guardSync)
onBeforeRouteUpdate((to, from) =>
  to.params.boardId !== from.params.boardId ? guardSync() : true,
)
function protectUnload(event: BeforeUnloadEvent) {
  if (store.pending || store.uncertain) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', protectUnload)
  void refresh()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', protectUnload)
  store.clear()
})
</script>
<template>
  <main class="workspace-page">
    <RouterLink
      v-if="isMyTasksPath(route.query.returnTo)"
      :to="String(route.query.returnTo)"
      class="mb-3 block text-sm text-primary"
      >← Công việc của tôi</RouterLink
    >
    <RouterLink
      :to="
        store.snapshot
          ? boardConfig.listPath(store.snapshot.board.workspace_id)
          : '/workspaces'
      "
      class="text-sm text-primary"
      >← Danh sách board</RouterLink
    >
    <PageHeader :title="store.snapshot?.board.name || 'Bảng công việc'">
      <Button
        variant="outline"
        :disabled="
          store.pending ||
          store.loading ||
          store.refreshing ||
          !!store.uncertain ||
          !online
        "
        @click="refresh(true)"
        >Tải lại</Button
      ><Button v-if="canWrite" @click="add()">Tạo công việc</Button>
    </PageHeader>
    <p v-if="!online" role="alert" class="mt-4 rounded-lg bg-amber-50 p-3">
      Đang offline. Kết nối lại để lưu thay đổi.
    </p>
    <p
      v-if="store.error"
      role="alert"
      class="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
    >
      {{ store.error }}
    </p>
    <Button
      v-if="store.uncertain"
      class="mt-3"
      :disabled="store.pending || !online"
      @click="store.retry"
      >Xác nhận lại thao tác</Button
    >
    <SyncStatus
      :connection="collabLabel"
      :value="{
        online,
        pending: store.pending,
        uncertain: !!store.uncertain,
        loading: store.loading,
        refreshing: store.refreshing,
        error: store.error,
        syncError: store.syncError,
        lastSyncedAt: store.lastSyncedAt,
      }"
    />
    <p v-if="store.loading" role="status" class="mt-4">Đang tải board…</p>
    <p v-if="taskLinkError" role="alert" class="mt-4 text-sm text-destructive">
      {{ taskLinkError }}
    </p>
    <template v-if="store.snapshot">
      <p
        v-if="
          store.snapshot.board.archived_at || store.snapshot.role === 'viewer'
        "
        class="mt-4 rounded-lg bg-muted p-3 text-sm"
      >
        {{
          store.snapshot.board.archived_at
            ? 'Board đã lưu trữ. Owner có thể khôi phục để tiếp tục làm việc.'
            : 'Vai trò Viewer: bạn chỉ có quyền xem.'
        }}
      </p>
      <p
        v-if="store.snapshot.workspace?.archived_at"
        role="status"
        class="mt-4 rounded-lg border p-4"
      >
        Workspace đã lưu trữ, nội dung chỉ đọc.
      </p>
      <details
        v-if="
          store.snapshot.role === 'owner' &&
          !store.snapshot.workspace?.archived_at
        "
        class="board-options"
      >
        <summary>Tuỳ chọn board</summary>
        <form
          v-if="store.snapshot.role === 'owner'"
          class="mt-5 flex flex-wrap items-end gap-2"
          @submit.prevent="rename"
        >
          <div class="field min-w-0 flex-1 basis-full sm:basis-auto">
            <Label for="rename-board">Tên board</Label
            ><Input
              id="rename-board"
              v-model="name"
              :maxlength="boardConfig.nameMaxLength"
              :disabled="!canWrite"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            :disabled="
              !canWrite ||
              !name.trim() ||
              nameVersion !== store.snapshot.board.version
            "
            >Lưu tên</Button
          ><Button
            type="button"
            variant="outline"
            :disabled="
              store.pending || store.loading || !!store.uncertain || !online
            "
            @click="
              store.mutate(
                store.snapshot.board.archived_at
                  ? 'restore_board'
                  : 'archive_board',
                {},
              )
            "
            >{{
              store.snapshot.board.archived_at
                ? 'Khôi phục board'
                : 'Lưu trữ board'
            }}</Button
          >
        </form>
      </details>
      <div
        v-if="
          store.snapshot.role === 'owner' &&
          nameVersion !== store.snapshot.board.version &&
          name !== store.snapshot.board.name
        "
        class="mt-3 text-sm text-amber-900"
      >
        Board đã thay đổi. Tên hiện tại: {{ store.snapshot.board.name }}.
        <Button
          variant="outline"
          :disabled="!canWrite"
          @click="nameVersion = store.snapshot.board.version"
          >Đã đối chiếu tên, dùng phiên bản mới</Button
        >
      </div>
      <div class="mt-6 flex flex-wrap gap-3">
        <span class="rounded-lg bg-muted px-3 py-2 text-sm"
          >{{ active.length }} công việc ·
          {{ active.filter((t) => t.status === 'done').length }} hoàn
          thành</span
        ><Button variant="outline" @click="showArchive = !showArchive">{{
          showArchive
            ? 'Về bảng công việc'
            : `Công việc lưu trữ (${archived.length})`
        }}</Button>
      </div>
      <div v-if="showArchive" class="mt-5 space-y-3">
        <p v-if="!archived.length" class="text-sm text-muted-foreground">
          Chưa có công việc lưu trữ.
        </p>
        <div
          v-for="task in archived"
          :key="task.id"
          class="flex items-center justify-between gap-3 rounded-lg border p-4"
        >
          <Button
            variant="link"
            class="min-w-0 whitespace-normal text-left"
            @click="edit(task)"
            >{{ task.title }}</Button
          ><Button
            v-if="canWrite"
            variant="outline"
            @click="store.mutate('restore_task', { id: task.id })"
            >Khôi phục</Button
          >
        </div>
      </div>
      <template v-else>
        <div class="my-5 flex flex-wrap gap-2">
          <Input
            v-model="query"
            class="w-full sm:w-64"
            aria-label="Tìm công việc"
            placeholder="Tìm công việc, thành viên…"
          /><Select v-model="priority"
            ><SelectTrigger class="w-full sm:w-44" aria-label="Lọc ưu tiên"
              ><SelectValue /></SelectTrigger
            ><SelectContent
              ><SelectItem value="all">Mọi ưu tiên</SelectItem
              ><SelectItem v-for="p in priorities" :key="p" :value="p">{{
                priorityLabels[p]
              }}</SelectItem></SelectContent
            ></Select
          ><Select v-model="assignee"
            ><SelectTrigger
              class="w-full sm:w-52"
              aria-label="Lọc người phụ trách"
              ><SelectValue /></SelectTrigger
            ><SelectContent
              ><SelectItem value="all">Mọi thành viên</SelectItem
              ><SelectItem value="none">Chưa giao</SelectItem
              ><SelectItem
                v-for="m in store.snapshot.members"
                :key="m.user_id"
                :value="m.user_id"
                >{{ m.display_name || m.email }}</SelectItem
              ></SelectContent
            ></Select
          >
        </div>
        <p v-if="filtered" class="mb-4 text-sm text-muted-foreground">
          Đang lọc: kéo thả tạm tắt. Bạn vẫn có thể đổi trạng thái qua
          menu.<Button variant="link" @click="clearFilters">Xóa bộ lọc</Button>
        </p>
        <LabelManager />
        <BulkTasks />
        <div class="board-grid">
          <section
            v-for="column in columns"
            :key="column.id"
            class="kanban-column"
            :aria-label="column.label"
          >
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-sm font-semibold">
                {{ column.label }} · {{ cards(column.id).length }}
              </h2>
              <Button
                v-if="canWrite"
                variant="ghost"
                :aria-label="`Thêm vào ${column.label}`"
                @click="add(column.id)"
                >+</Button
              >
            </div>
            <draggable
              :model-value="cards(column.id)"
              item-key="id"
              group="online-tasks"
              handle=".drag-handle"
              :animation="appConfig.dragAnimationMs"
              :disabled="!canWrite || filtered"
              ghost-class="drag-ghost"
              class="min-h-24 space-y-3 pb-2"
              @start="dragging = true"
              @end="dragging = false"
              @change="dragged(column.id, $event)"
              ><template #item="{ element }"
                ><TaskCard
                  :timezone="store.snapshot.workspace?.timezone"
                  :archived="
                    !!store.snapshot.workspace?.archived_at ||
                    !!store.snapshot.board.archived_at
                  "
                  :labels="
                    (store.snapshot.labels ?? []).filter((l) =>
                      element.label_ids?.includes(l.id),
                    )
                  "
                  :checklist="element.checklist"
                  :task="displayTask(element)"
                  :drag-disabled="!canWrite || filtered"
                  :read-only="!canWrite"
                  @edit="edit(element)"
                  @move="move" /></template
            ></draggable>
            <p
              v-if="!cards(column.id).length"
              class="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground"
            >
              {{ filtered ? 'Không có kết quả phù hợp' : 'Chưa có công việc' }}
            </p>
          </section>
        </div>
      </template>

      <OnlineTaskDialog
        :open="open"
        @update:open="setDialogOpen"
        :task="selected"
        :status="initial"
      />
    </template>
  </main>
</template>
