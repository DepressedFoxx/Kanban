<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  columns,
  priorities,
  priorityLabels,
  taskLimits,
  type Status,
} from '@/features/board/config'
import {
  taskInputSchema,
  boardError,
  type OnlineTask,
  type TaskDraft,
} from './model'
import TaskExtras from '@/features/tasks/TaskExtras.vue'
import TaskAttachments from '@/features/attachments/TaskAttachments.vue'
import TaskThread from '@/features/tasks/TaskThread.vue'
import TaskWatch from '@/features/notifications/TaskWatch.vue'
import { useTaskThreadStore } from '@/stores/taskThread'
import { taskLink } from '@/features/tasks/model'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
const props = defineProps<{
  open: boolean
  task: OnlineTask | null
  status: Status
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const thread = useTaskThreadStore()
const copyNotice = ref('')
const newId = () => crypto.randomUUID()
const showLink = ref(false)
const showDiscussion = ref(false)
const commentDirty = ref(false)
const extrasDirty = ref(false)
const attachmentsDirty = ref(false)
const initialDraft = ref('')
const confirmDiscard = ref(false)
let resolveNavigation: ((value: boolean) => void) | undefined
const draftKey = () =>
  JSON.stringify([
    form.title,
    form.description,
    form.status,
    form.priority,
    form.assignee_id,
    form.due_date,
  ])
const dirty = computed(
  () =>
    draftKey() !== initialDraft.value ||
    commentDirty.value ||
    extrasDirty.value ||
    attachmentsDirty.value,
)
function requestClose(value = false) {
  if (
    value ||
    store.pending ||
    thread.pending ||
    thread.uncertain ||
    store.uncertain
  )
    return
  if (dirty.value) confirmDiscard.value = true
  else emit('update:open', false)
}
function decideDiscard(discard: boolean) {
  confirmDiscard.value = false
  if (discard) {
    initialDraft.value = draftKey()
    commentDirty.value = false
    extrasDirty.value = false
    attachmentsDirty.value = false
  }
  if (resolveNavigation) {
    resolveNavigation(discard)
    resolveNavigation = undefined
  } else if (discard) emit('update:open', false)
}
function guardNavigation() {
  if (!props.open) return true
  if (store.pending || thread.pending || thread.uncertain || store.uncertain)
    return false
  if (!dirty.value) return true
  confirmDiscard.value = true
  return new Promise<boolean>((resolve) => {
    resolveNavigation = resolve
  })
}
onBeforeRouteLeave(guardNavigation)
onBeforeRouteUpdate((to, from) =>
  to.query.task !== from.query.task ? guardNavigation() : true,
)
function beforeUnload(event: BeforeUnloadEvent) {
  if (
    props.open &&
    (dirty.value ||
      store.pending ||
      thread.pending ||
      store.uncertain ||
      thread.uncertain)
  ) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  resolveNavigation?.(false)
})
const latestTask = computed(() =>
  store.snapshot?.tasks.find((t) => t.id === props.task?.id),
)
const comparisonFields = [
  'title',
  'description',
  'status',
  'priority',
  'assignee_id',
  'due_date',
] as const
const comparisonLabels = {
  title: 'Tên',
  description: 'Mô tả',
  status: 'Trạng thái',
  priority: 'Ưu tiên',
  assignee_id: 'Người phụ trách',
  due_date: 'Hạn hoàn thành',
}
const differences = computed(() =>
  comparisonFields.filter(
    (field) => (latestTask.value?.[field] ?? '') !== (form[field] ?? ''),
  ),
)
function displayValue(field: string, value: unknown) {
  if (!value) return 'Chưa có'
  if (field === 'status')
    return columns.find((c) => c.id === value)?.label || value
  if (field === 'priority')
    return priorityLabels[value as keyof typeof priorityLabels] || value
  if (field === 'assignee_id') {
    const member = store.snapshot?.members.find((m) => m.user_id === value)
    return (
      member?.display_name ||
      member?.email ||
      'Thành viên không còn trong workspace'
    )
  }
  return value
}
function useLatest() {
  if (!latestTask.value) return
  Object.assign(form, latestTask.value, {
    due_date: latestTask.value.due_date ?? '',
  })
  initialDraft.value = draftKey()
  baseVersion.value = store.snapshot?.board.version ?? 0
}

const store = useOnlineBoardStore(),
  baseVersion = ref(0),
  validation = ref('')
const form = reactive<TaskDraft>({
  id: '',
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
  due_date: '',
})
const assignee = computed({
  get: () => form.assignee_id ?? 'none',
  set: (value: string) => {
    form.assignee_id = value === 'none' ? null : value
  },
})
const taskArchived = computed(() =>
  Boolean(
    store.snapshot?.tasks.find((t) => t.id === props.task?.id)?.archived_at ??
    props.task?.archived_at,
  ),
)
const canEdit = computed(
  () =>
    store.writable &&
    !taskArchived.value &&
    !thread.pending &&
    !thread.uncertain,
)
const shareUrl = computed(() =>
  props.task
    ? new URL(
        taskLink(props.task.board_id, props.task.id),
        window.location.origin,
      ).href
    : '',
)
function documentFocus() {
  document.getElementById('online-task-title')?.focus()
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copyNotice.value = 'Đã sao chép link.'
  } catch {
    showLink.value = true
    copyNotice.value = 'Chọn đường dẫn bên dưới để sao chép.'
  }
}
const changed = computed(
  () => baseVersion.value !== store.snapshot?.board.version,
)
watch(
  () => [props.open, props.task?.id] as const,
  ([open, taskId], previous) => {
    if (open && previous?.[0] && taskId === previous[1]) return
    if (open) {
      Object.assign(
        form,
        props.task
          ? { ...props.task, due_date: props.task.due_date ?? '' }
          : {
              id: crypto.randomUUID(),
              title: '',
              description: '',
              status: props.status,
              priority: 'medium',
              assignee_id: null,
              due_date: '',
            },
      )
      baseVersion.value = store.snapshot?.board.version ?? 0
      validation.value = ''
      copyNotice.value = ''
      showLink.value = false
      showDiscussion.value = false
      commentDirty.value = false
      extrasDirty.value = false
      attachmentsDirty.value = false
      initialDraft.value = draftKey()
    }
  },
  { immediate: true },
)
watch(
  () => store.lastSuccess,
  () => {
    if (
      props.open &&
      !['save_task', 'archive_task'].includes(store.lastAction)
    ) {
      baseVersion.value = store.snapshot?.board.version ?? 0
      return
    }
    if (props.open) {
      initialDraft.value = draftKey()
      baseVersion.value = store.snapshot?.board.version ?? 0
      if (!commentDirty.value && !extrasDirty.value && !attachmentsDirty.value)
        emit('update:open', false)
    }
  },
)
async function save() {
  if (!canEdit.value) return
  try {
    const input = taskInputSchema.parse(form)
    validation.value = ''
    await store.mutate('save_task', input, baseVersion.value)
  } catch (cause) {
    validation.value = boardError(cause)
  }
}
async function archive() {
  if (props.task && canEdit.value)
    await store.mutate('archive_task', { id: props.task.id }, baseVersion.value)
}
</script>
<template>
  <Dialog :open="open" @update:open="requestClose"
    ><DialogContent
      class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
      @open-auto-focus.prevent="documentFocus"
    >
      <DialogHeader
        ><DialogTitle>{{
          task ? 'Chi tiết công việc' : 'Công việc mới'
        }}</DialogTitle
        ><DialogDescription>{{
          canEdit
            ? 'Thay đổi chỉ được lưu khi bạn xác nhận.'
            : 'Bạn đang xem công việc ở chế độ chỉ đọc.'
        }}</DialogDescription></DialogHeader
      >
      <div v-if="task" class="grid gap-2">
        <TaskWatch
          v-if="
            open &&
            !taskArchived &&
            !store.snapshot?.board.archived_at &&
            !store.snapshot?.workspace?.archived_at
          "
          :key="task.id"
          :task="task.id"
        />
        <div class="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" @click="copyLink"
            >Sao chép link task</Button
          ><span role="status" class="text-xs text-muted-foreground">{{
            copyNotice
          }}</span>
        </div>
        <Input
          v-if="showLink"
          :model-value="shareUrl"
          readonly
          aria-label="Đường dẫn task"
        />
        <p v-if="taskArchived" class="rounded-lg bg-muted p-3 text-sm">
          Công việc đã lưu trữ. Bạn vẫn có thể xem bình luận và lịch sử.
        </p>
        <Button
          v-if="taskArchived && store.writable"
          type="button"
          variant="outline"
          :disabled="thread.pending || !!thread.uncertain"
          @click="store.mutate('restore_task', { id: task.id })"
          >Khôi phục công việc</Button
        >
      </div>
      <div v-if="task" class="flex gap-2" aria-label="Nội dung công việc">
        <Button
          variant="outline"
          :aria-pressed="!showDiscussion"
          @click="showDiscussion = false"
          >Chi tiết</Button
        ><Button
          variant="outline"
          :aria-pressed="showDiscussion"
          @click="showDiscussion = true"
          >Bình luận &amp; lịch sử</Button
        >
      </div>
      <form v-show="!showDiscussion" class="grid gap-4" @submit.prevent="save">
        <fieldset :disabled="!canEdit" class="grid min-w-0 gap-4">
          <div class="field">
            <Label for="online-task-title">Tên công việc</Label
            ><Input
              id="online-task-title"
              v-model="form.title"
              :maxlength="taskLimits.title"
              required
            />
          </div>
          <div class="field">
            <Label for="online-task-description">Mô tả</Label
            ><Textarea
              id="online-task-description"
              v-model="form.description"
              :maxlength="taskLimits.description"
              rows="3"
            />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="field">
              <Label for="online-task-status">Trạng thái</Label
              ><Select v-model="form.status" :disabled="!canEdit"
                ><SelectTrigger id="online-task-status" class="w-full"
                  ><SelectValue /></SelectTrigger
                ><SelectContent
                  ><SelectItem
                    v-for="column in columns"
                    :key="column.id"
                    :value="column.id"
                    >{{ column.label }}</SelectItem
                  ></SelectContent
                ></Select
              >
            </div>
            <div class="field">
              <Label for="online-task-priority">Ưu tiên</Label
              ><Select v-model="form.priority" :disabled="!canEdit"
                ><SelectTrigger id="online-task-priority" class="w-full"
                  ><SelectValue /></SelectTrigger
                ><SelectContent
                  ><SelectItem
                    v-for="value in priorities"
                    :key="value"
                    :value="value"
                    >{{ priorityLabels[value] }}</SelectItem
                  ></SelectContent
                ></Select
              >
            </div>
            <div class="field">
              <Label for="online-task-assignee">Người phụ trách</Label
              ><Select v-model="assignee" :disabled="!canEdit"
                ><SelectTrigger id="online-task-assignee" class="w-full"
                  ><SelectValue /></SelectTrigger
                ><SelectContent
                  ><SelectItem value="none">Chưa giao</SelectItem
                  ><SelectItem
                    v-for="member in store.snapshot?.members"
                    :key="member.user_id"
                    :value="member.user_id"
                    >{{ member.display_name || member.email }}</SelectItem
                  ></SelectContent
                ></Select
              >
            </div>
            <div class="field">
              <Label for="online-task-date">Hạn hoàn thành</Label
              ><Input
                id="online-task-date"
                v-model="form.due_date"
                type="date"
              />
            </div>
          </div>
        </fieldset>
        <p
          v-if="validation || store.error"
          role="alert"
          class="text-sm text-destructive"
        >
          {{ validation || store.error }}
        </p>
        <div
          v-if="changed && canEdit"
          class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p>
            Board đã thay đổi. So sánh bản hiện tại với bản nháp trước khi lưu.
          </p>
          <dl v-if="latestTask" class="mt-3 space-y-3">
            <div
              v-for="field in differences"
              :key="field"
              class="break-words rounded border p-3"
            >
              <dt class="font-semibold">{{ comparisonLabels[field] }}</dt>
              <dd>Hiện tại: {{ displayValue(field, latestTask[field]) }}</dd>
              <dd>Bản nháp: {{ displayValue(field, form[field]) }}</dd>
            </div>
          </dl>
          <p v-if="latestTask && !differences.length" class="mt-2">
            Thông tin task không thay đổi; cập nhật đến từ phần khác của board.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              v-if="latestTask"
              type="button"
              variant="outline"
              @click="useLatest"
              >Dùng bản hiện tại</Button
            ><Button
              type="button"
              variant="outline"
              @click="baseVersion = store.snapshot!.board.version"
              >Giữ bản nháp để lưu</Button
            >
          </div>
        </div>
        <Button
          v-if="store.uncertain"
          type="button"
          :disabled="store.pending || thread.pending || !!thread.uncertain"
          @click="store.retry"
          >Xác nhận lại thao tác</Button
        >
        <DialogFooter class="task-actions gap-2 sm:justify-between"
          ><Button
            v-if="task && canEdit"
            type="button"
            variant="outline"
            :disabled="changed"
            @click="archive"
            >Lưu trữ công việc</Button
          >
          <div class="flex gap-2">
            <Button
              type="button"
              variant="outline"
              :disabled="store.pending || thread.pending || !!thread.uncertain"
              @click="requestClose(false)"
              >Đóng</Button
            ><Button
              v-if="
                store.snapshot?.role !== 'viewer' &&
                !store.snapshot?.workspace?.archived_at &&
                !store.snapshot?.board.archived_at &&
                !taskArchived
              "
              type="submit"
              :disabled="!canEdit || !form.title.trim() || changed"
              >{{ store.pending ? 'Đang lưu…' : 'Lưu công việc' }}</Button
            >
          </div></DialogFooter
        >
      </form>
      <TaskExtras
        v-if="task && open"
        :key="task.id"
        :task="task.id"
        :read-only="!canEdit"
        @draft-change="extrasDirty = $event"
      />
      <Button
        v-if="task && canEdit"
        variant="outline"
        class="mt-3"
        :disabled="dirty || changed"
        @click="
          store.mutate('duplicate_task', { id: task.id, new_id: newId() })
        "
        >Nhân bản công việc đã lưu</Button
      >
      <TaskAttachments
        v-if="task && open"
        :key="task.id"
        :task="task.id"
        :revision="store.snapshot?.board.version"
        :read-only="!canEdit"
        @draft-change="attachmentsDirty = $event"
      />
      <TaskThread
        v-if="task && open"
        v-show="showDiscussion"
        @draft-change="commentDirty = $event"
        :key="task.id"
        :board="task.board_id"
        :task="task.id"
        :read-only="
          store.snapshot?.role === 'viewer' ||
          !!store.snapshot?.workspace?.archived_at ||
          !!store.snapshot?.board.archived_at ||
          taskArchived
        "
        @access-denied="store.clear()"
      /> </DialogContent
  ></Dialog>
  <AlertDialog
    :open="confirmDiscard"
    @update:open="
      (value) => {
        if (!value) decideDiscard(false)
      }
    "
  >
    <AlertDialogContent
      ><AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle
      ><AlertDialogDescription
        >Bản nháp công việc hoặc bình luận chưa gửi sẽ bị
        mất.</AlertDialogDescription
      ><AlertDialogFooter
        ><AlertDialogCancel @click="decideDiscard(false)"
          >Tiếp tục chỉnh sửa</AlertDialogCancel
        ><AlertDialogAction @click="decideDiscard(true)"
          >Bỏ thay đổi</AlertDialogAction
        ></AlertDialogFooter
      ></AlertDialogContent
    >
  </AlertDialog>
</template>
