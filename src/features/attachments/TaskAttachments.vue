<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  attachmentsApi,
  attachmentConfig,
  attachmentError,
  uncertain,
  formatBytes,
  type Attachment,
  type AttachmentList,
} from './api'
const props = defineProps<{
  task: string
  revision?: number
  readOnly?: boolean
}>()
const emit = defineEmits<{ draftChange: [value: boolean] }>()
const list = ref<AttachmentList | null>(null),
  error = ref(''),
  notice = ref(''),
  busy = ref(false),
  loading = ref(false),
  target = ref<Attachment | null>(null),
  reason = ref('')
type Pending =
  | { kind: 'upload'; id: string; file: File }
  | { kind: 'delete'; id: string; receipt: string; reason: string }
const pending = ref<Pending | null>(null)
let generation = 0,
  alive = true
watch(pending, (value) => emit('draftChange', !!value))
onBeforeUnmount(() => {
  alive = false
  generation++
})
async function load() {
  const current = ++generation
  loading.value = true
  try {
    const value = await attachmentsApi.list(props.task)
    if (alive && current === generation) {
      list.value = value
      if (!pending.value) error.value = ''
    }
  } catch (e) {
    if (alive && current === generation) {
      list.value = null
      error.value = attachmentError(e)
    }
  } finally {
    if (alive && current === generation) loading.value = false
  }
}
watch(
  () => [props.task, props.revision],
  () => void load(),
  { immediate: true },
)
async function perform() {
  const operation = pending.value
  if (!operation || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (operation.kind === 'upload')
      await attachmentsApi.upload(props.task, operation.id, operation.file)
    else
      await attachmentsApi.remove(
        operation.id,
        operation.receipt,
        operation.reason,
      )
    pending.value = null
    target.value = null
    notice.value =
      operation.kind === 'upload' ? 'Đã tải file lên.' : 'Đã xoá file.'
    await load()
  } catch (e) {
    error.value = attachmentError(e)
    if (!uncertain(e)) pending.value = null
  } finally {
    busy.value = false
  }
}
function select(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.size || file.size > attachmentConfig.maxBytes) {
    error.value = 'File phải có dung lượng từ 1 byte đến 10 MiB.'
    return
  }
  pending.value = { kind: 'upload', id: crypto.randomUUID(), file }
  void perform()
}
function remove() {
  if (!target.value) return
  pending.value = {
    kind: 'delete',
    id: target.value.id,
    receipt: crypto.randomUUID(),
    reason: reason.value.trim(),
  }
  void perform()
}
function confirmRemoval(file: Attachment) {
  target.value = file
  reason.value = ''
}
async function download(file: Attachment) {
  busy.value = true
  error.value = ''
  try {
    const url = await attachmentsApi.download(file.id)
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    a.download = file.name
    document.body.append(a)
    a.click()
    a.remove()
  } catch (e) {
    error.value = attachmentError(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="task-section min-w-0 space-y-3" aria-label="File đính kèm">
    <div class="flex items-center justify-between gap-3">
      <h3 class="font-semibold">
        File đính kèm <span v-if="list">({{ list.items.length }}/20)</span>
      </h3>
      <Button
        size="sm"
        variant="ghost"
        :disabled="loading || busy"
        @click="load"
        >Tải lại file</Button
      >
    </div>
    <p class="text-xs text-muted-foreground">
      PNG, JPEG, WebP, PDF, TXT · Tối đa 10 MiB/file. Không xem trước nội dung.
    </p>
    <p class="text-xs text-muted-foreground">
      Liên kết tải có hạn 60 giây; thu hồi quyền không xoá được bản đã tải hoặc
      liên kết còn hạn.
    </p>
    <p v-if="list" class="text-xs text-muted-foreground">
      Workspace đã dùng {{ formatBytes(list.used_bytes) }} / 500 MiB (gồm file
      đang tải và đã lưu trữ).
    </p>
    <div v-if="list?.writable && !readOnly" class="space-y-2">
      <Label :for="`attachment-${task}`">Thêm file</Label
      ><Input
        :id="`attachment-${task}`"
        type="file"
        :accept="attachmentConfig.accept"
        :disabled="busy || !!pending || list.items.length >= 20"
        @change="select"
      />
    </div>
    <p v-if="loading && !list" role="status">Đang tải danh sách file…</p>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ error }}
    </p>
    <p v-if="notice" role="status" class="text-sm">{{ notice }}</p>
    <div v-if="pending" class="rounded-md border p-3 text-sm">
      <p>
        {{
          busy
            ? 'Đang xử lý…'
            : 'Kết quả chưa được xác nhận. Thử lại dùng cùng mã yêu cầu, không tạo bản sao.'
        }}
      </p>
      <Button v-if="!busy" class="mt-2" variant="outline" @click="perform"
        >Thử lại thao tác file</Button
      >
    </div>
    <p v-if="list && !list.items.length" class="text-sm text-muted-foreground">
      Chưa có file đính kèm.
    </p>
    <ul v-if="list?.items.length" class="space-y-2">
      <li
        v-for="file in list.items"
        :key="file.id"
        class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border p-3"
      >
        <div class="min-w-0 flex-1">
          <p class="break-all text-sm font-medium">{{ file.name }}</p>
          <p class="text-xs text-muted-foreground">
            {{ formatBytes(file.size) }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          :disabled="busy"
          :aria-label="`Tải xuống ${file.name}`"
          @click="download(file)"
          >Tải xuống</Button
        ><Button
          v-if="file.can_delete && !readOnly"
          variant="ghost"
          size="sm"
          :disabled="busy || !!pending"
          :aria-label="`Xoá ${file.name}`"
          @click="confirmRemoval(file)"
          >Xoá</Button
        >
      </li>
    </ul>
    <AlertDialog
      :open="!!target"
      @update:open="
        (value) => {
          if (!value && !busy && !pending) target = null
        }
      "
      ><AlertDialogContent
        ><AlertDialogHeader
          ><AlertDialogTitle>Xoá file đính kèm?</AlertDialogTitle
          ><AlertDialogDescription
            >File {{ target?.name }} sẽ bị xoá vĩnh viễn. Liên kết tải xuống đã
            cấp có thể còn hiệu lực tối đa 60 giây.</AlertDialogDescription
          ></AlertDialogHeader
        ><template v-if="target?.requires_reason"
          ><Label for="attachment-reason"
            >Lý do xoá file của thành viên khác</Label
          ><Textarea
            id="attachment-reason"
            v-model="reason"
            :maxlength="500"
            :disabled="busy || !!pending"
        /></template>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>
        <AlertDialogFooter
          ><AlertDialogCancel :disabled="busy || !!pending"
            >Huỷ</AlertDialogCancel
          ><Button
            variant="destructive"
            :disabled="
              busy || !!pending || (target?.requires_reason && !reason.trim())
            "
            @click="remove"
            >Xoá file</Button
          ><Button v-if="pending && !busy" @click="perform"
            >Thử lại thao tác file</Button
          ></AlertDialogFooter
        ></AlertDialogContent
      ></AlertDialog
    >
  </section>
</template>
