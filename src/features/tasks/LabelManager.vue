<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  productivityConfig as limits,
  labelColors,
  labelClasses,
} from './productivity'
const store = useOnlineBoardStore()
const id = ref(''),
  name = ref(''),
  color = ref<keyof typeof labelColors>('blue'),
  version = ref(0),
  deleting = ref('')
const owner = computed(() => store.snapshot?.role === 'owner' && store.writable)
function edit(label: {
  id: string
  name: string
  color: keyof typeof labelColors
}) {
  id.value = label.id
  name.value = label.name
  color.value = label.color
  version.value = store.snapshot?.board.version ?? 0
}
function reset() {
  id.value = ''
  name.value = ''
  color.value = 'blue'
}
watch(
  () => store.lastSuccess,
  () => {
    if (store.lastAction === 'label_save') reset()
  },
)
async function save() {
  if (
    await store.mutate(
      'label_save',
      {
        id: id.value || crypto.randomUUID(),
        name: name.value,
        color: color.value,
      },
      id.value ? version.value : store.snapshot?.board.version,
    )
  )
    reset()
}
async function remove() {
  if (await store.mutate('label_delete', { id: deleting.value })) {
    deleting.value = ''
    reset()
  }
}
</script>
<template>
  <details class="my-4 rounded-lg border bg-card p-4">
    <summary class="cursor-pointer font-medium">
      Quản lý nhãn ({{ store.snapshot?.labels?.length ?? 0 }}/{{
        limits.labelsPerWorkspace
      }})
    </summary>
    <ul class="my-3 space-y-2">
      <li
        v-for="label in store.snapshot?.labels ?? []"
        :key="label.id"
        class="flex flex-wrap items-center gap-2"
      >
        <span
          class="rounded px-2 py-1 text-sm"
          :class="labelClasses[label.color]"
          >{{ label.name }}</span
        ><template v-if="owner"
          ><Button
            variant="ghost"
            :aria-label="'Sửa nhãn ' + label.name"
            @click="edit(label)"
            >Sửa</Button
          ><Button
            variant="ghost"
            :aria-label="'Xóa nhãn ' + label.name"
            @click="deleting = label.id"
            >Xóa</Button
          ></template
        >
      </li>
    </ul>
    <form
      v-if="owner"
      class="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
      @submit.prevent="save"
    >
      <div>
        <Label for="label-name">Tên nhãn</Label
        ><Input
          id="label-name"
          v-model="name"
          required
          :maxlength="limits.labelName"
        />
      </div>
      <div>
        <Label for="label-color">Màu nhãn</Label
        ><Select v-model="color"
          ><SelectTrigger id="label-color"><SelectValue /></SelectTrigger
          ><SelectContent
            ><SelectItem
              v-for="(title, key) in labelColors"
              :key="key"
              :value="key"
              >{{ title }}</SelectItem
            ></SelectContent
          ></Select
        >
      </div>
      <div class="flex items-end gap-2">
        <Button
          type="submit"
          :disabled="
            !name.trim() ||
            (!id &&
              (store.snapshot?.labels?.length ?? 0) >=
                limits.labelsPerWorkspace)
          "
          >{{ id ? 'Lưu nhãn' : 'Tạo nhãn' }}</Button
        ><Button v-if="id" type="button" variant="outline" @click="reset"
          >Hủy sửa</Button
        >
      </div>
    </form>
    <p
      v-if="id && version !== store.snapshot?.board.version"
      role="status"
      class="mt-2 text-sm"
    >
      Board đã đổi. Chọn lại Sửa nhãn để tải bản mới trước khi lưu.
    </p>
  </details>
  <AlertDialog
    :open="!!deleting"
    @update:open="
      (v) => {
        if (!v && !store.pending && !store.uncertain) deleting = ''
      }
    "
    ><AlertDialogContent
      ><AlertDialogTitle>Xóa nhãn?</AlertDialogTitle
      ><AlertDialogDescription
        >Nhãn sẽ bị gỡ khỏi mọi task trong workspace. Task vẫn được giữ
        nguyên.</AlertDialogDescription
      ><AlertDialogFooter
        ><AlertDialogCancel :disabled="store.pending || !!store.uncertain"
          >Hủy</AlertDialogCancel
        ><Button :disabled="!owner || !!store.uncertain" @click="remove"
          >Xóa nhãn</Button
        ></AlertDialogFooter
      >
      <p v-if="store.error" role="alert">{{ store.error }}</p>
      <Button
        v-if="store.uncertain"
        :disabled="store.pending"
        @click="
          store.retry().then((ok) => {
            if (ok) deleting = ''
          })
        "
        >Xác nhận lại thao tác</Button
      ></AlertDialogContent
    ></AlertDialog
  >
</template>
