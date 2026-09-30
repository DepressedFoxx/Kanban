<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
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
import { useOnlineBoardStore } from '@/stores/onlineBoard'
const props = defineProps<{
  open: boolean
  task: OnlineTask | null
  status: Status
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
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
const changed = computed(
  () => baseVersion.value !== store.snapshot?.board.version,
)
watch(
  () => props.open,
  (open) => {
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
    }
  },
)
watch(
  () => store.lastSuccess,
  () => {
    if (props.open) emit('update:open', false)
  },
)
async function save() {
  if (!store.writable) return
  try {
    const input = taskInputSchema.parse(form)
    validation.value = ''
    await store.mutate('save_task', input, baseVersion.value)
  } catch (cause) {
    validation.value = boardError(cause)
  }
}
async function archive() {
  if (props.task && store.writable)
    await store.mutate('archive_task', { id: props.task.id }, baseVersion.value)
}
</script>
<template>
  <Dialog
    :open="open"
    @update:open="!store.pending && emit('update:open', $event)"
    ><DialogContent
      class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
    >
      <DialogHeader
        ><DialogTitle>{{
          task ? 'Chi tiết công việc' : 'Công việc mới'
        }}</DialogTitle
        ><DialogDescription>{{
          store.writable
            ? 'Thay đổi chỉ được lưu khi bạn xác nhận.'
            : 'Bạn đang xem công việc ở chế độ chỉ đọc.'
        }}</DialogDescription></DialogHeader
      >
      <form class="grid gap-4" @submit.prevent="save">
        <fieldset :disabled="!store.writable" class="grid min-w-0 gap-4">
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
              ><Select v-model="form.status" :disabled="!store.writable"
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
              ><Select v-model="form.priority" :disabled="!store.writable"
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
              ><Select v-model="assignee" :disabled="!store.writable"
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
          v-if="changed && store.writable"
          class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Board đã thay đổi từ lúc mở form. Hãy đối chiếu bản nháp trước khi ghi
          đè.<Button
            type="button"
            variant="outline"
            class="mt-2 whitespace-normal"
            @click="baseVersion = store.snapshot!.board.version"
            >Đã đối chiếu, dùng phiên bản mới</Button
          >
        </div>
        <Button
          v-if="store.uncertain"
          type="button"
          :disabled="store.pending"
          @click="store.retry"
          >Xác nhận lại thao tác</Button
        >
        <DialogFooter class="gap-2 sm:justify-between"
          ><Button
            v-if="task && store.writable"
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
              :disabled="store.pending"
              @click="emit('update:open', false)"
              >Đóng</Button
            ><Button
              v-if="
                store.snapshot?.role !== 'viewer' &&
                !store.snapshot?.board.archived_at
              "
              type="submit"
              :disabled="!store.writable || !form.title.trim() || changed"
              >{{ store.pending ? 'Đang lưu…' : 'Lưu công việc' }}</Button
            >
          </div></DialogFooter
        >
      </form>
    </DialogContent></Dialog
  >
</template>
