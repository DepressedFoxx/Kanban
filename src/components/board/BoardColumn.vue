<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { usePreferredReducedMotion } from '@vueuse/core'
import { appConfig } from '@/config/app'
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { Plus } from '@lucide/vue'
import { useBoardStore } from '@/stores/board'
import type { Status, Task } from '@/features/board/model'
import TaskCard from './TaskCard.vue'

const props = defineProps<{
  status: Status
  label: string
  color: string
  query: string
  priority: string
}>()
const emit = defineEmits<{ edit: [task: Task]; add: [status: Status] }>()
const board = useBoardStore()
const reducedMotion = usePreferredReducedMotion()
const filtered = computed(() => Boolean(props.query.trim() || props.priority))
const cards = computed({
  get: () =>
    board.tasks.filter(
      (task) =>
        task.status === props.status &&
        `${task.title} ${task.description} ${task.assignee}`
          .toLocaleLowerCase(appConfig.locale)
          .includes(props.query.trim().toLocaleLowerCase(appConfig.locale)) &&
        (!props.priority || task.priority === props.priority),
    ),
  set: (value: Task[]) => board.reorder(props.status, value),
})
</script>

<template>
  <section class="kanban-column" :aria-label="label">
    <div class="mb-4 flex items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 text-sm font-semibold">
        <span
          class="size-2 rounded-full"
          :style="{ backgroundColor: color }"
        />{{ label
        }}<span
          class="rounded bg-card px-2 py-0.5 text-xs text-muted-foreground"
          >{{ cards.length }}</span
        >
      </h2>
      <Button
        variant="ghost"
        class="rounded-md p-2 text-muted-foreground hover:bg-card"
        :aria-label="`Thêm vào ${label}`"
        @click="emit('add', status)"
      >
        <Plus :size="16" />
      </Button>
    </div>
    <draggable
      v-model="cards"
      item-key="id"
      group="tasks"
      handle=".drag-handle"
      :animation="reducedMotion === 'reduce' ? 0 : appConfig.dragAnimationMs"
      :disabled="filtered"
      ghost-class="drag-ghost"
      class="min-h-24 space-y-3 pb-2"
    >
      <template #item="{ element }">
        <TaskCard
          :task="element"
          :drag-disabled="filtered"
          @edit="emit('edit', $event)"
          @move="board.move"
        />
      </template>
    </draggable>
    <p
      v-if="!cards.length"
      class="mb-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
    >
      {{ filtered ? 'Không có kết quả phù hợp' : 'Chưa có công việc' }}
    </p>
    <Button
      variant="ghost"
      class="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs text-muted-foreground hover:bg-card"
      @click="emit('add', status)"
    >
      <Plus :size="14" />Thêm công việc
    </Button>
  </section>
</template>
