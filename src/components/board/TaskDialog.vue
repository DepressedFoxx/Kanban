<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Trash2 } from '@lucide/vue'
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
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
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
  taskDefaults,
  taskLimits,
} from '@/features/board/config'
import type { Task, TaskInput, Status } from '@/features/board/model'
import { useBoardStore } from '@/stores/board'
const props = defineProps<{
  open: boolean
  task: Task | null
  initialStatus: Status
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const board = useBoardStore()
const form = reactive<TaskInput>({ ...taskDefaults })
const canSave = computed(() => Boolean(form.title.trim()))
watch(
  () => props.open,
  (open) => {
    if (open)
      Object.assign(
        form,
        props.task ?? { ...taskDefaults, status: props.initialStatus },
      )
  },
)
function submit() {
  if (!canSave.value) return
  board.save(
    {
      title: form.title.trim(),
      description: form.description,
      status: form.status,
      priority: form.priority,
      assignee: form.assignee.trim(),
      dueDate: form.dueDate,
    },
    props.task?.id,
  )
  emit('update:open', false)
}
function remove() {
  if (!props.task) return
  board.remove(props.task.id)
  emit('update:open', false)
}
</script>
<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>{{
          task ? 'Chi tiết công việc' : 'Công việc mới'
        }}</DialogTitle>
        <DialogDescription
          >Một bước nhỏ để dự án tiến về phía trước.</DialogDescription
        >
      </DialogHeader>
      <form class="grid gap-4" @submit.prevent="submit">
        <div class="field">
          <Label for="task-title">Tên công việc</Label
          ><Input
            id="task-title"
            v-model="form.title"
            :maxlength="taskLimits.title"
            required
            placeholder="Bạn cần làm gì?"
          />
        </div>
        <div class="field">
          <Label for="task-description">Mô tả</Label
          ><Textarea
            id="task-description"
            v-model="form.description"
            :maxlength="taskLimits.description"
            rows="3"
            placeholder="Bối cảnh, kết quả mong muốn…"
          />
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="field">
            <Label for="task-status">Trạng thái</Label
            ><Select v-model="form.status"
              ><SelectTrigger id="task-status" class="w-full"
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
            <Label for="task-priority">Ưu tiên</Label
            ><Select v-model="form.priority"
              ><SelectTrigger id="task-priority" class="w-full"
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
            <Label for="task-assignee">Người phụ trách</Label
            ><Input
              id="task-assignee"
              v-model="form.assignee"
              :maxlength="taskLimits.assignee"
              placeholder="Tên thành viên"
            />
          </div>
          <div class="field">
            <Label for="task-due-date">Hạn hoàn thành</Label
            ><Input id="task-due-date" v-model="form.dueDate" type="date" />
          </div>
        </div>
        <p v-if="!canSave" class="text-xs text-muted-foreground">
          Nhập tên công việc để bật nút lưu.
        </p>
        <DialogFooter
          class="gap-2 border-t border-border pt-4 sm:justify-between"
        >
          <AlertDialog v-if="task">
            <AlertDialogTrigger as-child
              ><Button type="button" variant="ghost" class="text-destructive"
                ><Trash2 :size="14" />Xóa công việc</Button
              ></AlertDialogTrigger
            >
            <AlertDialogContent>
              <AlertDialogHeader
                ><AlertDialogTitle>Xóa công việc?</AlertDialogTitle
                ><AlertDialogDescription
                  >Công việc “{{ task.title }}” sẽ bị xóa. Thao tác này không
                  thể hoàn tác.</AlertDialogDescription
                ></AlertDialogHeader
              >
              <AlertDialogFooter
                ><AlertDialogCancel>Hủy</AlertDialogCancel
                ><AlertDialogAction
                  class="bg-destructive text-white hover:bg-destructive/90"
                  @click="remove"
                  >Xóa công việc</AlertDialogAction
                ></AlertDialogFooter
              >
            </AlertDialogContent> </AlertDialog
          ><span v-else />
          <div class="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              @click="emit('update:open', false)"
              >Hủy</Button
            ><Button type="submit" :disabled="!canSave">Lưu công việc</Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
