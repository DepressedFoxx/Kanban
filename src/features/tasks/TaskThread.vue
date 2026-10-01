<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import SyncStatus from '@/features/sync/SyncStatus.vue'
import { useCollab } from '@/features/collab/useCollab'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useTaskThreadStore } from '@/stores/taskThread'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { taskConfig, type TaskActivity } from './model'
import { columns, priorityLabels } from '@/features/board/config'
const props = defineProps<{ board: string; task: string; readOnly: boolean }>()
const emit = defineEmits<{
  'access-denied': []
  'draft-change': [value: boolean]
}>()
const store = useTaskThreadStore(),
  boardStore = useOnlineBoardStore(),
  draft = ref(''),
  tab = ref<'comments' | 'activity'>('comments')
watch(draft, (value) => emit('draft-change', Boolean(value.trim())))
const { online } = useCollab(
  () => [
    {
      table: 'task_comments',
      event: 'INSERT',
      filter: `task_id=eq.${props.task}`,
    },
    {
      table: 'task_activity',
      event: 'INSERT',
      filter: `task_id=eq.${props.task}`,
    },
  ],
  () => store.load(props.board, props.task, 'latest', true),
  () => !store.denied,
)
const actions = {
  created: 'đã tạo công việc',
  updated: 'đã cập nhật công việc',
  archived: 'đã lưu trữ công việc',
  restored: 'đã khôi phục công việc',
}
const fields: Record<string, string> = {
  title: 'Tên',
  description: 'Mô tả',
  status: 'Trạng thái',
  priority: 'Ưu tiên',
  assignee_id: 'Người phụ trách',
  due_date: 'Hạn hoàn thành',
  position: 'Vị trí',
  archived_at: 'Lưu trữ',
}
function visibleChanges(event: TaskActivity) {
  return Object.fromEntries(
    Object.entries(event.changes).filter(
      ([, change]) =>
        !(
          (change.before == null || change.before === '') &&
          (change.after == null || change.after === '')
        ),
    ),
  )
}
function formatDate(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Chưa có'
  if (field === 'status')
    return columns.find((c) => c.id === value)?.label ?? String(value)
  if (field === 'priority')
    return priorityLabels[value as keyof typeof priorityLabels] ?? String(value)
  if (field === 'assignee_id') {
    const member = boardStore.snapshot?.members.find((m) => m.user_id === value)
    return (
      member?.display_name ||
      member?.email ||
      `Thành viên ${String(value).slice(0, 8)}`
    )
  }
  if (field === 'archived_at') return 'Đã lưu trữ'
  if (field === 'position') return String(Number(value) + 1)
  return String(value)
}
watch(
  () => [props.board, props.task],
  () => {
    store.clear()
    draft.value = ''
    void store.load(props.board, props.task)
  },
  { immediate: true },
)
watch(
  () => store.denied,
  (value) => {
    if (value) emit('access-denied')
  },
)
watch(
  () => store.lastSuccess,
  (value) => {
    if (value) draft.value = ''
  },
)
onBeforeUnmount(() => {
  store.clear()
})
</script>
<template>
  <section class="mt-5 min-w-0 border-t pt-5" aria-label="Thảo luận và lịch sử">
    <div class="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        :variant="tab === 'comments' ? 'default' : 'outline'"
        :aria-pressed="tab === 'comments'"
        @click="tab = 'comments'"
        >Bình luận</Button
      ><Button
        type="button"
        :variant="tab === 'activity' ? 'default' : 'outline'"
        :aria-pressed="tab === 'activity'"
        @click="tab = 'activity'"
        >Lịch sử</Button
      ><Button
        type="button"
        variant="ghost"
        :disabled="
          store.loading ||
          store.pending ||
          store.refreshing ||
          !!store.uncertain ||
          !online
        "
        @click="store.load(board, task)"
        >Tải lại thảo luận</Button
      >
    </div>
    <SyncStatus
      :value="{
        online,
        pending: store.pending,
        uncertain: !!store.uncertain,
        loading: store.loading,
        refreshing: store.refreshing,
        error: store.error,
        syncError: store.syncError,
        lastSyncedAt: store.lastSyncedAt,
      }"
    />
    <p v-if="store.error" role="alert" class="mt-3 text-sm text-destructive">
      {{ store.error }}
    </p>
    <p
      v-if="store.syncError"
      role="status"
      class="mt-3 text-xs text-muted-foreground"
    >
      {{ store.syncError }}
    </p>
    <p v-if="store.loading" role="status" class="mt-3 text-sm">
      Đang tải thảo luận…
    </p>
    <template v-if="tab === 'comments'">
      <form
        v-if="store.canComment && !readOnly"
        class="mt-4 grid gap-2"
        @submit.prevent="store.comment(board, task, draft)"
      >
        <Label for="task-comment">Bình luận mới</Label
        ><Textarea
          id="task-comment"
          v-model="draft"
          :maxlength="taskConfig.commentMaxLength"
          :disabled="store.pending || !!store.uncertain"
          rows="3"
          placeholder="Chia sẻ tiến độ hoặc trao đổi về công việc…"
        />
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-muted-foreground"
            >{{ draft.length }} / {{ taskConfig.commentMaxLength }}</span
          ><Button
            type="submit"
            :disabled="
              !online ||
              store.pending ||
              store.loading ||
              !!store.uncertain ||
              !draft.trim()
            "
            >{{ store.pending ? 'Đang gửi…' : 'Gửi bình luận' }}</Button
          >
        </div>
      </form>
      <p
        v-else-if="!store.loading && !store.error"
        class="mt-3 text-xs text-muted-foreground"
      >
        Chỉ Owner/Member được bình luận trên task và board đang hoạt động.
      </p>
      <Button
        v-if="store.uncertain"
        class="mt-3"
        :disabled="store.pending || !online"
        @click="store.retry"
        >Xác nhận lại bình luận</Button
      >
      <p
        v-if="!store.loading && !store.error && !store.comments.length"
        class="mt-4 text-sm text-muted-foreground"
      >
        Chưa có bình luận. Bắt đầu cuộc trao đổi đầu tiên.
      </p>
      <ul class="mt-4 space-y-3">
        <li
          v-for="comment in store.comments"
          :key="comment.id"
          class="min-w-0 rounded-lg border bg-card p-3"
        >
          <div class="flex flex-wrap justify-between gap-2 text-xs">
            <strong>{{ comment.actor_name }}</strong
            ><time
              :datetime="comment.created_at"
              class="text-muted-foreground"
              >{{ formatDate(comment.created_at) }}</time
            >
          </div>
          <p class="mt-2 whitespace-pre-wrap break-words text-sm">
            {{ comment.body }}
          </p>
        </li>
      </ul>
      <Button
        v-if="store.moreComments"
        variant="outline"
        class="mt-3"
        :disabled="store.loading || store.pending"
        @click="store.load(board, task, 'comments')"
        >Bình luận cũ hơn</Button
      >
    </template>
    <template v-else>
      <p
        v-if="!store.loading && !store.error && !store.activity.length"
        class="mt-4 text-sm text-muted-foreground"
      >
        Chưa có lịch sử. Các thay đổi từ khi bật module này sẽ được ghi lại.
      </p>
      <ul class="mt-4 space-y-3">
        <li
          v-for="event in store.activity"
          :key="event.id"
          class="min-w-0 rounded-lg border bg-card p-3"
        >
          <p class="text-sm">
            <strong>{{ event.actor_name }}</strong> {{ actions[event.action] }}
          </p>
          <time
            :datetime="event.created_at"
            class="text-xs text-muted-foreground"
            >{{ formatDate(event.created_at) }}</time
          >
          <ul class="mt-2 space-y-1 text-xs text-muted-foreground">
            <li
              v-for="(change, field) in visibleChanges(event)"
              :key="field"
              class="break-words"
            >
              <strong>{{ fields[field] || field }}:</strong>
              {{ fieldValue(field, change.before) }} →
              {{ fieldValue(field, change.after) }}
            </li>
          </ul>
        </li>
      </ul>
      <Button
        v-if="store.moreActivity"
        variant="outline"
        class="mt-3"
        :disabled="store.loading || store.pending"
        @click="store.load(board, task, 'activity')"
        >Lịch sử cũ hơn</Button
      >
    </template>
  </section>
</template>
