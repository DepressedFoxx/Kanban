<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { isOverdue } from '@/features/tasks/model'
import { labelClasses } from '@/features/tasks/productivity'
import {
  CalendarDays,
  Ellipsis,
  Archive,
  Check,
  ArrowRight,
  FileText,
} from '@lucide/vue'
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
  canArchive?: boolean
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
  archive: [id: string]
}>()
const menuItemClass =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0'
function moveTo(status: Status) {
  if (!props.readOnly && status !== props.task.status)
    emit('move', props.task.id, status)
}
function archiveTask() {
  if (props.canArchive && !props.readOnly) emit('archive', props.task.id)
}
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
    <div
      class="task-card-header mb-3 flex min-h-11 items-center justify-between gap-2"
      :class="{ 'drag-handle': !dragDisabled && !readOnly }"
      :title="
        !dragDisabled && !readOnly
          ? 'Kéo phần đầu thẻ để di chuyển công việc'
          : undefined
      "
    >
      <span class="priority" :data-priority="task.priority">{{
        priorityLabels[task.priority]
      }}</span>
      <div class="flex items-center gap-1">
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <Button
              :id="`task-actions-${task.id}`"
              type="button"
              variant="ghost"
              size="icon"
              class="task-menu-trigger cursor-pointer"
              :disabled="readOnly"
              :aria-label="`Thao tác: ${task.title}`"
              title="Thao tác công việc"
              @pointerdown.stop
              @click.stop
              ><Ellipsis aria-hidden="true"
            /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="end"
              :side-offset="6"
              class="z-50 w-64 max-w-[calc(100vw-2rem)] max-h-[var(--reka-dropdown-menu-content-available-height)] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              <DropdownMenuItem
                :class="menuItemClass"
                @select="emit('edit', task)"
                ><FileText aria-hidden="true" />Mở chi tiết</DropdownMenuItem
              >
              <DropdownMenuSeparator class="my-1 h-px bg-border" />
              <DropdownMenuLabel
                class="px-3 py-2 text-xs font-medium text-muted-foreground"
                >Chuyển trạng thái</DropdownMenuLabel
              >
              <DropdownMenuItem
                v-for="column in columns"
                :key="column.id"
                :class="menuItemClass"
                :disabled="readOnly || task.status === column.id"
                :aria-label="
                  task.status === column.id
                    ? `${column.label} (hiện tại)`
                    : `Chuyển sang ${column.label}`
                "
                @select="moveTo(column.id)"
              >
                <Check
                  v-if="task.status === column.id"
                  aria-hidden="true"
                /><ArrowRight v-else aria-hidden="true" />{{ column.label }}
              </DropdownMenuItem>
              <template v-if="canArchive">
                <DropdownMenuSeparator class="my-1 h-px bg-border" />
                <DropdownMenuItem
                  :class="menuItemClass"
                  :disabled="readOnly"
                  @select="archiveTask"
                  ><Archive aria-hidden="true" />Lưu trữ công
                  việc</DropdownMenuItem
                >
              </template>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
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
  </article>
</template>
