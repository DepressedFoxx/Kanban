<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Check, Circle } from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { columns } from '@/features/board/config'
import { productivityConfig as limits } from './productivity'
const store = useOnlineBoardStore(),
  ids = ref<string[]>([]),
  status = ref('todo'),
  action = ref(''),
  version = ref(0)
const tasks = computed(
  () => store.snapshot?.tasks.filter((t) => !t.archived_at) ?? [],
)
watch(
  () => tasks.value.map((task) => task.id).join(','),
  () => {
    ids.value = ids.value.filter((id) =>
      tasks.value.some((task) => task.id === id),
    )
  },
)
function toggle(id: string) {
  ids.value = ids.value.includes(id)
    ? ids.value.filter((v) => v !== id)
    : [...ids.value, id]
}
function confirm(value: string) {
  action.value = value
  version.value = store.snapshot?.board.version ?? 0
}
async function run() {
  if (
    await store.mutate(
      action.value,
      { ids: ids.value, status: status.value },
      version.value,
    )
  ) {
    ids.value = []
    action.value = ''
  }
}
</script>
<template>
  <details
    v-if="
      store.snapshot?.role !== 'viewer' &&
      !store.snapshot?.workspace?.archived_at &&
      !store.snapshot?.board.archived_at
    "
    class="my-4 rounded-lg border bg-card p-4"
  >
    <summary class="cursor-pointer font-medium">
      Thao tác nhiều công việc
    </summary>
    <p class="my-3 text-sm text-muted-foreground">
      Chọn tối đa {{ limits.bulkTasks }} công việc trên các trang đang hiển thị.
      Toàn bộ lựa chọn được lưu cùng lúc; nếu có xung đột sẽ không đổi công việc
      nào.
    </p>
    <div class="max-h-60 space-y-1 overflow-y-auto">
      <Button
        v-for="task in tasks"
        :key="task.id"
        variant="ghost"
        class="h-auto w-full justify-start whitespace-normal text-left"
        :aria-pressed="ids.includes(task.id)"
        :aria-label="'Chọn ' + task.title"
        :disabled="
          !store.writable ||
          (!ids.includes(task.id) && ids.length >= limits.bulkTasks)
        "
        @click="toggle(task.id)"
        ><Check v-if="ids.includes(task.id)" aria-hidden="true" /><Circle
          v-else
          aria-hidden="true"
        />
        {{ task.title }}</Button
      >
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span class="text-sm">{{ ids.length }} đã chọn</span
      ><Select v-model="status"
        ><SelectTrigger class="w-40" aria-label="Trạng thái hàng loạt"
          ><SelectValue /></SelectTrigger
        ><SelectContent
          ><SelectItem v-for="c in columns" :key="c.id" :value="c.id">{{
            c.label
          }}</SelectItem></SelectContent
        ></Select
      ><Button
        :disabled="!ids.length || !store.writable"
        @click="confirm('bulk_status')"
        >Đổi trạng thái đã chọn</Button
      ><Button
        variant="outline"
        :disabled="!ids.length || !store.writable"
        @click="confirm('bulk_archive')"
        >Lưu trữ đã chọn</Button
      ><Button
        variant="ghost"
        :disabled="store.pending || !!store.uncertain"
        @click="ids = []"
        >Bỏ chọn</Button
      >
    </div>
  </details>
  <AlertDialog
    :open="!!action"
    @update:open="
      (v) => {
        if (!v && !store.pending && !store.uncertain) action = ''
      }
    "
    ><AlertDialogContent
      ><AlertDialogTitle>Xác nhận {{ ids.length }} công việc</AlertDialogTitle
      ><AlertDialogDescription>{{
        action === 'bulk_archive'
          ? 'Lưu trữ toàn bộ công việc đã chọn.'
          : 'Đổi trạng thái toàn bộ công việc đã chọn thành ' +
            columns.find((c) => c.id === status)?.label +
            '.'
      }}</AlertDialogDescription
      ><AlertDialogFooter
        ><AlertDialogCancel :disabled="store.pending || !!store.uncertain"
          >Hủy</AlertDialogCancel
        ><Button :disabled="!store.writable" @click="run"
          >Xác nhận thay đổi</Button
        ></AlertDialogFooter
      >
      <p v-if="store.error" role="alert">{{ store.error }}</p>
      <Button
        v-if="store.uncertain"
        :disabled="store.pending"
        @click="
          store.retry().then((ok) => {
            if (ok) {
              action = ''
              ids = []
            }
          })
        "
        >Xác nhận lại thao tác</Button
      ></AlertDialogContent
    ></AlertDialog
  >
</template>
