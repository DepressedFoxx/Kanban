<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { isOverdue } from '@/features/tasks/model'
import { labelClasses } from '@/features/tasks/productivity'
import { CalendarDays, GripVertical } from '@lucide/vue'
import {
  columns,
  priorityLabels,
  type Task,
  type Status,
} from '@/features/board/model'

const props = defineProps<{
  task: Task
  dragDisabled: boolean
  readOnly?: boolean
  timezone?: string
  archived?: boolean
  labels?: { id: string; name: string; color: string }[]
  checklist?: { done: boolean }[]
}>()
const now = ref(new Date())
let dateTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  dateTimer = setInterval(() => {
    now.value = new Date()
  }, 60000)
})
onBeforeUnmount(() => clearInterval(dateTimer))
const overdue = computed(() =>
  isOverdue(
    props.task.dueDate,
    props.task.status,
    now.value,
    props.timezone,
    props.archived,
  ),
)
const emit = defineEmits<{
  edit: [task: Task]
  move: [id: string, status: Status]
}>()
</script>

<template>
  <article class="task-card">
    <div v-if="labels?.length" class="mb-2 flex flex-wrap gap-1">
      <span
        v-for="label in labels"
        :key="label.id"
        class="rounded px-2 py-1 text-xs"
        :class="labelClasses[label.color]"
        >{{ label.name }}</span
      >
    </div>
    <p v-if="checklist?.length" class="mb-2 text-xs text-muted-foreground">
      Checklist {{ checklist.filter((i) => i.done).length }}/{{
        checklist.length
      }}
    </p>
    <div class="mb-3 flex items-center justify-between gap-2">
      <span class="priority" :data-priority="task.priority">{{
        priorityLabels[task.priority]
      }}</span>
      <span
        v-if="!dragDisabled"
        class="drag-handle rounded p-1 text-stone-400"
        aria-hidden="true"
        ><GripVertical :size="15"
      /></span>
    </div>
    <Button
      variant="ghost"
      class="h-auto whitespace-normal block w-full p-0 text-left text-sm font-semibold leading-6 hover:text-primary"
      @click="emit('edit', task)"
    >
      {{ task.title }}
    </Button>
    <p
      v-if="task.description"
      class="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground"
    >
      {{ task.description }}
    </p>
    <div
      class="mt-5 flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground"
    >
      <span class="flex min-w-0 items-center gap-2"
        ><span class="avatar">{{ (task.assignee || '?').slice(0, 1) }}</span
        ><span class="truncate">{{ task.assignee || 'Chưa giao' }}</span></span
      >
      <span v-if="task.dueDate" class="flex shrink-0 items-center gap-1"
        ><CalendarDays :size="12" />{{ task.dueDate.slice(8) }}/{{
          task.dueDate.slice(5, 7)
        }}</span
      >
    </div>
    <p v-if="overdue" class="mt-3 text-xs font-medium text-destructive">
      Quá hạn · {{ task.dueDate }}
    </p>
    <label class="sr-only" :for="`move-${task.id}`"
      >Chuyển trạng thái: {{ task.title }}</label
    >
    <Select
      :disabled="readOnly"
      :model-value="task.status"
      @update:model-value="emit('move', task.id, $event as Status)"
      ><SelectTrigger :id="`move-${task.id}`" class="mt-3 w-full text-xs"
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
  </article>
</template>
