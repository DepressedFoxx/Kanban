<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
import { X, Trash2 } from '@lucide/vue'
import Button from '@/components/ui/button/Button.vue'
import {
  columns,
  type Task,
  type TaskInput,
  type Status,
} from '@/features/board/model'
import { useBoardStore } from '@/stores/board'

const props = defineProps<{
  open: boolean
  task: Task | null
  initialStatus: Status
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const board = useBoardStore()
const form = reactive<TaskInput>({
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignee: '',
  dueDate: '',
})
const confirmDelete = ref(false)
const canSave = computed(() => Boolean(form.title.trim()))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(
      form,
      props.task ?? {
        title: '',
        description: '',
        status: props.initialStatus,
        priority: 'medium',
        assignee: '',
        dueDate: '',
      },
    )
    confirmDelete.value = false
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
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  board.remove(props.task.id)
  emit('update:open', false)
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-40 bg-stone-950/35 backdrop-blur-sm"
      />
      <DialogContent class="dialog-panel">
        <div class="flex items-start justify-between gap-4">
          <div>
            <DialogTitle class="text-xl font-semibold">{{
              task ? 'Chi tiết công việc' : 'Công việc mới'
            }}</DialogTitle
            ><DialogDescription class="mt-2 text-sm text-muted-foreground"
              >Một bước nhỏ để dự án tiến về phía trước.</DialogDescription
            >
          </div>
          <DialogClose class="rounded p-2 hover:bg-muted" aria-label="Đóng"
            ><X :size="18"
          /></DialogClose>
        </div>
        <form class="mt-6 grid gap-4" @submit.prevent="submit">
          <label class="field"
            >Tên công việc<input
              v-model="form.title"
              maxlength="120"
              required
              placeholder="Bạn cần làm gì?"
          /></label>
          <label class="field"
            >Mô tả<textarea
              v-model="form.description"
              maxlength="2000"
              rows="3"
              placeholder="Bối cảnh, kết quả mong muốn…"
            />
          </label>
          <div class="grid grid-cols-2 gap-4">
            <label class="field"
              >Trạng thái<select v-model="form.status">
                <option
                  v-for="column in columns"
                  :key="column.id"
                  :value="column.id"
                >
                  {{ column.label }}
                </option>
              </select></label
            >
            <label class="field"
              >Ưu tiên<select v-model="form.priority">
                <option value="low">Thấp</option>
                <option value="medium">Vừa</option>
                <option value="high">Cao</option>
              </select></label
            >
            <label class="field"
              >Người phụ trách<input
                v-model="form.assignee"
                maxlength="60"
                placeholder="Tên thành viên"
            /></label>
            <label class="field"
              >Hạn hoàn thành<input v-model="form.dueDate" type="date"
            /></label>
          </div>
          <p v-if="!canSave" class="text-xs text-muted-foreground">
            Nhập tên công việc để bật nút lưu.
          </p>
          <div
            class="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"
          >
            <button
              v-if="task"
              type="button"
              class="flex items-center gap-1 rounded px-2 py-2 text-xs text-red-700"
              @click="remove"
            >
              <Trash2 :size="14" />{{
                confirmDelete ? 'Bấm lại để xác nhận xóa' : 'Xóa công việc'
              }}</button
            ><span v-else />
            <div class="flex gap-2">
              <Button variant="outline" @click="emit('update:open', false)"
                >Hủy</Button
              ><Button type="submit" :disabled="!canSave">Lưu công việc</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
