<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Search, SlidersHorizontal, ArrowUpRight } from '@lucide/vue'
import Button from '@/components/ui/button/Button.vue'
import BoardColumn from '@/components/board/BoardColumn.vue'
import TaskDialog from '@/components/board/TaskDialog.vue'
import { columns, type Status, type Task } from '@/features/board/model'
import { useBoardStore } from '@/stores/board'

const board = useBoardStore()
const query = ref('')
const priority = ref('')
const open = ref(false)
const selectedTask = ref<Task | null>(null)
const initialStatus = ref<Status>('todo')
const progress = computed(() =>
  board.tasks.length
    ? Math.round((board.completed / board.tasks.length) * 100)
    : 0,
)

function add(status: Status = 'todo') {
  selectedTask.value = null
  initialStatus.value = status
  open.value = true
}

function edit(task: Task) {
  selectedTask.value = task
  open.value = true
}
function clearFilters() {
  query.value = ''
  priority.value = ''
}
</script>

<template>
  <div class="mx-auto max-w-[1600px] p-5 lg:p-9">
    <div class="mb-7 flex flex-wrap items-start justify-between gap-5">
      <div>
        <p
          class="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
        >
          Dự án / Khởi đầu
        </p>
        <h1 class="text-3xl font-semibold tracking-tight">
          Từ ý tưởng đến hoàn thành<span class="text-primary">.</span>
        </h1>
        <p class="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Một nơi cho công việc, những bước tiến và sự tập trung của nhóm.
        </p>
      </div>
      <Button @click="add()"><Plus :size="17" />Tạo công việc</Button>
    </div>
    <div class="mb-7 grid gap-4 sm:grid-cols-3">
      <div class="metric">
        <span>Tổng công việc</span
        ><strong>{{ board.tasks.length.toString().padStart(2, '0') }}</strong
        ><small>Mọi việc trong một tầm nhìn</small>
      </div>
      <div class="metric">
        <span>Đang thực hiện</span
        ><strong>{{
          board.tasks
            .filter((task) => task.status === 'doing')
            .length.toString()
            .padStart(2, '0')
        }}</strong
        ><small>Tập trung vào bước tiếp theo</small>
      </div>
      <div class="metric bg-primary! text-primary-foreground!">
        <span class="text-white/75!"
          >Tiến độ hoàn thành <ArrowUpRight :size="16" /></span
        ><strong
          >{{ progress
          }}<small class="ml-1 text-lg text-white/70!">%</small></strong
        >
        <div
          class="mt-2 h-1 rounded-full bg-white/20"
          role="progressbar"
          :aria-valuenow="progress"
          :aria-valuemin="0"
          :aria-valuemax="100"
          aria-label="Tiến độ"
        >
          <div
            class="h-1 rounded-full bg-[#bad5bc] transition-all"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>
    </div>
    <div
      class="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
    >
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold">Bảng công việc</h2>
        <span
          class="rounded-full bg-stone-100 px-2 py-1 text-[11px] text-muted-foreground"
          >{{ board.tasks.length }} mục</span
        >
      </div>
      <div class="flex w-full flex-wrap gap-2 sm:w-auto">
        <label class="search-field"
          ><Search :size="16" /><input
            v-model="query"
            aria-label="Tìm công việc"
            placeholder="Tìm công việc, thành viên…"
        /></label>
        <label
          class="flex items-center gap-2 rounded-lg border border-border bg-white px-3"
          ><SlidersHorizontal :size="14" /><select
            v-model="priority"
            aria-label="Lọc ưu tiên"
            class="min-h-10 bg-transparent text-xs"
          >
            <option value="">Mọi ưu tiên</option>
            <option value="high">Ưu tiên cao</option>
            <option value="medium">Ưu tiên vừa</option>
            <option value="low">Ưu tiên thấp</option>
          </select></label
        >
      </div>
    </div>
    <p
      v-if="query.trim() || priority"
      class="mb-4 text-xs text-muted-foreground"
    >
      Đang lọc: kéo thả tạm tắt để giữ đúng thứ tự. Bạn vẫn có thể đổi trạng
      thái bằng menu trên thẻ.
      <button class="underline" @click="clearFilters">Xóa bộ lọc</button>
    </p>
    <p
      v-if="board.storageError"
      role="alert"
      class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
    >
      {{ board.storageError }}
    </p>
    <div class="board-grid">
      <BoardColumn
        v-for="column in columns"
        :key="column.id"
        :status="column.id"
        :label="column.label"
        :color="column.color"
        :query="query"
        :priority="priority"
        @add="add"
        @edit="edit"
      />
    </div>
    <p class="mt-5 text-xs text-muted-foreground" role="status">
      Bản local · Lưu trên trình duyệt này · {{ board.completed }}/{{
        board.tasks.length
      }}
      công việc hoàn thành
    </p>
    <TaskDialog
      v-model:open="open"
      :task="selectedTask"
      :initial-status="initialStatus"
    />
  </div>
</template>
