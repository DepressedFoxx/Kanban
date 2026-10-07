<script setup lang="ts">
import RefreshButton from '@/components/RefreshButton.vue'
import ServerPagination from '@/components/ServerPagination.vue'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import type { TaskComment } from './model'
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
const auth = useAuthStore(),
  editing = ref<TaskComment | null>(null),
  editBody = ref(''),
  deleting = ref<TaskComment | null>(null),
  reason = ref('')
const busy = computed(() => store.pending || !!store.uncertain)
watch([draft, editing, editBody, deleting, reason], () =>
  emit(
    'draft-change',
    Boolean(draft.value.trim() || editing.value || deleting.value),
  ),
)
function startDelete(comment: TaskComment) {
  deleting.value = { ...comment }
  reason.value = ''
}
function startEdit(comment: TaskComment) {
  editing.value = { ...comment }
  editBody.value = comment.body ?? ''
}
async function saveEdit() {
  if (!editing.value) return
  if (
    await store.change(props.board, props.task, {
      comment: editing.value.id,
      version: editing.value.version ?? 1,
      action: 'edit',
      body: editBody.value,
      reason: null,
    })
  )
    editing.value = null
}
async function removeComment() {
  if (!deleting.value) return
  if (
    await store.change(props.board, props.task, {
      comment: deleting.value.id,
      version: deleting.value.version ?? 1,
      action: 'delete',
      body: null,
      reason: reason.value,
    })
  ) {
    deleting.value = null
    reason.value = ''
  }
}
watch(
  () => store.lastSuccess,
  () => {
    editing.value = null
    deleting.value = null
    reason.value = ''
    store.commentPage.page = 1
    store.activityPage.page = 1
    void store.load(props.board, props.task, 'latest', true)
  },
)
const { online } = useCollab(
  () => [
    {
      table: 'workspaces',
      event: 'UPDATE',
      filter: `id=eq.${boardStore.snapshot?.board.workspace_id}`,
    },
    {
      table: 'task_comments',
      event: 'INSERT',
      filter: `task_id=eq.${props.task}`,
    },
    {
      table: 'task_comments',
      event: 'UPDATE',
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
  attachment_added: 'Thêm file',
  attachment_removed: 'Xoá file',
  attachment_delete_reason: 'Lý do xoá file',
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
  if (field === 'task_details' && value && typeof value === 'object') {
    const details = value as { label_ids: unknown; items: unknown }
    return (
      'Nhãn: ' +
      fieldValue('task_labels', details.label_ids) +
      '; Checklist: ' +
      fieldValue('checklist', details.items)
    )
  }
  if (field === 'checklist')
    return Array.isArray(value)
      ? value
          .map((i: any) =>
            typeof i === 'object' ? (i.done ? '✓ ' : '○ ') + i.body : String(i),
          )
          .join('; ')
      : String(value)
  if (field === 'task_labels')
    return Array.isArray(value)
      ? value
          .map(
            (id) =>
              boardStore.snapshot?.labels?.find((l) => l.id === id)?.name ??
              'Nhãn đã xóa',
          )
          .join(', ')
      : String(value)
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
  <div>
    <section class="task-section min-w-0" aria-label="Thảo luận và lịch sử">
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
        ><RefreshButton
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
          label="Tải lại thảo luận"
        />
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
              {{ comment.deleted_at ? 'Bình luận đã được xóa.' : comment.body }}
            </p>
            <span
              v-if="comment.edited_at && !comment.deleted_at"
              class="text-xs text-muted-foreground"
              >Đã chỉnh sửa</span
            >
            <div
              v-if="!readOnly && store.canComment && !comment.deleted_at"
              class="mt-2 flex gap-2"
            >
              <Button
                v-if="comment.actor_id === auth.user?.id"
                variant="ghost"
                :disabled="busy || !!editing"
                @click="startEdit(comment)"
                >Sửa bình luận</Button
              >
              <Button
                v-if="
                  comment.actor_id === auth.user?.id ||
                  boardStore.snapshot?.role === 'owner'
                "
                variant="ghost"
                :disabled="busy || !!editing"
                @click="startDelete(comment)"
                >Xóa bình luận</Button
              >
            </div>
            <form
              v-if="editing?.id === comment.id"
              class="mt-3 space-y-2"
              @submit.prevent="saveEdit"
            >
              <Label :for="'edit-' + comment.id">Nội dung chỉnh sửa</Label
              ><Textarea
                :id="'edit-' + comment.id"
                v-model="editBody"
                :maxlength="taskConfig.commentMaxLength"
                :disabled="busy || readOnly"
              />
              <p
                v-if="editing.version !== comment.version"
                role="status"
                class="text-sm"
              >
                Bình luận đã đổi. Bản nháp vẫn được giữ. Hủy sửa để tải nội dung
                mới.
              </p>
              <Button
                type="submit"
                :disabled="
                  busy ||
                  readOnly ||
                  !editBody.trim() ||
                  editing.version !== comment.version
                "
                >Lưu bình luận</Button
              ><Button
                type="button"
                variant="outline"
                :disabled="busy"
                @click="editing = null"
                >Hủy sửa</Button
              >
            </form>
          </li>
        </ul>
        <ServerPagination
          :page="store.commentPage.page"
          :page-size="store.commentPage.pageSize"
          :total="store.commentPage.total"
          :disabled="busy || store.loading || store.refreshing || !!editing"
          label="Phân trang bình luận"
          @change="
            (page, size) =>
              store.load(board, task, 'comments', false, page, size)
          "
        />
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
              <strong>{{ event.actor_name }}</strong>
              {{ actions[event.action] }}
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
        <ServerPagination
          :page="store.activityPage.page"
          :page-size="store.activityPage.pageSize"
          :total="store.activityPage.total"
          :disabled="busy || store.loading || store.refreshing"
          label="Phân trang lịch sử task"
          @change="
            (page, size) =>
              store.load(board, task, 'activity', false, page, size)
          "
        />
      </template>
    </section>
    <AlertDialog
      :open="!!deleting"
      @update:open="
        (v) => {
          if (!v && !busy) deleting = null
        }
      "
      ><AlertDialogContent
        ><AlertDialogTitle>Xóa bình luận?</AlertDialogTitle
        ><AlertDialogDescription
          >Nội dung sẽ được thay bằng dấu đã xóa và không thể khôi
          phục.</AlertDialogDescription
        ><template v-if="deleting && deleting.actor_id !== auth.user?.id"
          ><Label for="moderation-reason">Lý do xóa (bắt buộc)</Label
          ><Textarea
            id="moderation-reason"
            v-model="reason"
            :maxlength="500"
            :disabled="busy"
        /></template>
        <p v-if="store.error" role="alert">{{ store.error }}</p>
        <AlertDialogFooter
          ><AlertDialogCancel :disabled="busy">Hủy</AlertDialogCancel
          ><Button
            :disabled="
              busy ||
              readOnly ||
              (deleting?.actor_id !== auth.user?.id && !reason.trim())
            "
            @click="removeComment"
            >Xóa bình luận</Button
          ></AlertDialogFooter
        ><Button
          v-if="store.uncertain"
          :disabled="store.pending"
          @click="store.retry"
          >Xác nhận lại thao tác</Button
        ></AlertDialogContent
      ></AlertDialog
    >
  </div>
</template>
