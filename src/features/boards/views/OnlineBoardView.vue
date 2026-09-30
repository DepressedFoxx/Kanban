<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
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
  online = ref(navigator.onLine),
  dragging = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
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
function add(status: Status = 'todo') {
  selected.value = null
  initial.value = status
  open.value = true
}
function edit(task: OnlineTask) {
  selected.value = task
  open.value = true
}
async function refresh() {
  if (!store.pending && !store.uncertain) {
    const previousName = store.snapshot?.board.name
    await store.load(id)
    if (!previousName || name.value === previousName) {
      name.value = store.snapshot?.board.name ?? ''
      nameVersion.value = store.snapshot?.board.version ?? 0
    }
  }
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
function revalidate() {
  if (
    !open.value &&
    !dragging.value &&
    !document.hidden &&
    online.value &&
    !store.pending &&
    !store.loading &&
    !store.uncertain
  )
    void refresh()
}
function connection() {
  online.value = navigator.onLine
  if (online.value) revalidate()
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
onMounted(() => {
  void refresh()
  timer = setInterval(revalidate, boardConfig.refreshMs)
  window.addEventListener('focus', revalidate)
  window.addEventListener('online', connection)
  window.addEventListener('offline', connection)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('focus', revalidate)
  window.removeEventListener('online', connection)
  window.removeEventListener('offline', connection)
  store.clear()
})
</script>
<template>
  <main class="mx-auto max-w-[1600px] p-5 lg:p-9">
    <RouterLink
      :to="
        store.snapshot
          ? boardConfig.listPath(store.snapshot.board.workspace_id)
          : '/workspaces'
      "
      class="text-sm text-primary"
      >← Danh sách board</RouterLink
    >
    <div class="mt-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="break-words text-3xl font-semibold">
          {{ store.snapshot?.board.name || 'Bảng công việc' }}
        </h1>
        <p class="mt-2 text-sm text-muted-foreground">
          Board workspace · Dữ liệu lưu trên Supabase
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          variant="outline"
          :disabled="store.pending || store.loading || !!store.uncertain"
          @click="refresh()"
          >Tải lại</Button
        ><Button v-if="canWrite" @click="add()">Tạo công việc</Button>
      </div>
    </div>
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
    <p v-if="store.loading" role="status" class="mt-4">Đang tải board…</p>
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
          <span class="min-w-0 break-words">{{ task.title }}</span
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
      <p role="status" class="mt-5 text-xs text-muted-foreground">
        {{
          store.pending
            ? 'Đang lưu…'
            :  store.notice || 'Đã tải dữ liệu từ Supabase.'
        }}
        · Tự kiểm tra cập nhật mỗi 30 giây khi không mở form.
      </p>
      <OnlineTaskDialog
        v-model:open="open"
        :task="selected"
        :status="initial"
      />
    </template>
  </main>
</template>
