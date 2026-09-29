<script setup lang="ts">
import { CalendarDays, GripVertical } from '@lucide/vue'
import {
  columns,
  priorityLabels,
  type Task,
  type Status,
} from '@/features/board/model'

defineProps<{ task: Task; dragDisabled: boolean }>()
const emit = defineEmits<{
  edit: [task: Task]
  move: [id: string, status: Status]
}>()

function move(event: Event, id: string) {
  emit('move', id, (event.target as HTMLSelectElement).value as Status)
}
</script>

<template>
  <article class="task-card">
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
    <button
      class="block w-full text-left text-sm font-semibold leading-6 hover:text-primary"
      @click="emit('edit', task)"
    >
      {{ task.title }}
    </button>
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
    <label class="sr-only" :for="`move-${task.id}`"
      >Chuyển trạng thái: {{ task.title }}</label
    >
    <select
      :id="`move-${task.id}`"
      :value="task.status"
      class="mt-3 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-muted-foreground"
      @change="move($event, task.id)"
    >
      <option v-for="column in columns" :key="column.id" :value="column.id">
        {{ column.label }}
      </option>
    </select>
  </article>
</template>
