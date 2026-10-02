<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOnlineBoardStore } from '@/stores/onlineBoard'
import { productivityConfig as limits, labelClasses } from './productivity'
const props = defineProps<{ task: string; readOnly: boolean }>()
const emit = defineEmits<{ 'draft-change': [boolean] }>()
const store = useOnlineBoardStore()
const newId = () => crypto.randomUUID()
const current = computed(() =>
  store.snapshot?.tasks.find((t) => t.id === props.task),
)
const labels = ref<string[]>([])
const items = ref<{ id: string; body: string; done: boolean }[]>([])
const baseline = ref(''),
  version = ref(0),
  message = ref('')
const key = () => JSON.stringify([labels.value, items.value])
const dirty = computed(() => key() !== baseline.value)
const conflict = computed(() => version.value !== store.snapshot?.board.version)
const blocked = computed(() => props.readOnly || !store.writable)
function reset() {
  labels.value = [...(current.value?.label_ids ?? [])]
  items.value = (current.value?.checklist ?? []).map(({ id, body, done }) => ({
    id,
    body,
    done,
  }))
  baseline.value = key()
  version.value = store.snapshot?.board.version ?? 0
  message.value = ''
}
watch(() => props.task, reset, { immediate: true })
watch(
  () => store.snapshot?.board.version,
  () => {
    if (!dirty.value && !store.pending && !store.uncertain) reset()
  },
)
watch(dirty, (v) => emit('draft-change', v), { immediate: true })
function toggle(id: string) {
  labels.value = labels.value.includes(id)
    ? labels.value.filter((v) => v !== id)
    : [...labels.value, id]
}
function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= items.value.length) return
  const item = items.value.splice(index, 1)[0]!
  items.value.splice(target, 0, item)
}
async function save() {
  if (blocked.value || conflict.value) return
  if (
    labels.value.length > limits.labelsPerTask ||
    items.value.some((i) => !i.body.trim())
  ) {
    message.value = 'Kiểm tra nhãn và nội dung checklist.'
    return
  }
  // One atomic mutation saves labels and checklist together.
  if (
    await store.mutate(
      'task_details',
      { id: props.task, label_ids: labels.value, items: items.value },
      version.value,
    )
  )
    reset()
}
const attempt = ref('')
watch(
  () => store.uncertain?.id,
  (id) => {
    if (id) attempt.value = id
  },
)
watch(
  () => store.lastSuccess,
  (id) => {
    if (id && id === attempt.value) {
      attempt.value = ''
      reset()
    }
  },
)
</script>
<template>
  <section
    class="mt-5 min-w-0 space-y-4 border-t pt-4"
    aria-label="Nhãn và checklist"
  >
    <h3 class="font-semibold">Nhãn</h3>
    <p
      v-if="!store.snapshot?.labels?.length"
      class="text-sm text-muted-foreground"
    >
      Chưa có nhãn. Owner có thể tạo trong mục Quản lý nhãn trên board.
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="label in store.snapshot?.labels ?? []"
        :key="label.id"
        type="button"
        variant="outline"
        :class="labelClasses[label.color]"
        :aria-pressed="labels.includes(label.id)"
        :disabled="
          blocked ||
          (!labels.includes(label.id) && labels.length >= limits.labelsPerTask)
        "
        @click="toggle(label.id)"
        >{{ labels.includes(label.id) ? '✓ ' : '' }}{{ label.name }}</Button
      >
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-semibold">
        Checklist · {{ items.filter((i) => i.done).length }}/{{ items.length }}
      </h3>
      <Button
        type="button"
        variant="outline"
        :disabled="blocked || items.length >= limits.checklistItems"
        @click="items.push({ id: newId(), body: '', done: false })"
        >Thêm mục</Button
      >
    </div>
    <ol class="space-y-3">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="space-y-2 rounded-lg border p-3"
      >
        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            :aria-pressed="item.done"
            :aria-label="'Hoàn thành mục ' + (index + 1)"
            :disabled="blocked"
            @click="item.done = !item.done"
            >{{ item.done ? '✓' : '○' }}</Button
          ><Input
            v-model="item.body"
            :aria-label="'Nội dung mục ' + (index + 1)"
            :maxlength="limits.checklistBody"
            :disabled="blocked"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            :disabled="blocked || index === 0"
            :aria-label="'Đưa mục ' + (index + 1) + ' lên'"
            @click="move(index, -1)"
            >Lên</Button
          ><Button
            type="button"
            variant="ghost"
            :disabled="blocked || index === items.length - 1"
            :aria-label="'Đưa mục ' + (index + 1) + ' xuống'"
            @click="move(index, 1)"
            >Xuống</Button
          ><Button
            type="button"
            variant="ghost"
            :disabled="blocked"
            :aria-label="'Xóa mục ' + (index + 1)"
            @click="items.splice(index, 1)"
            >Xóa mục</Button
          >
        </div>
      </li>
    </ol>
    <p v-if="message" role="alert" class="text-sm text-destructive">
      {{ message }}
    </p>
    <div
      v-if="dirty && conflict"
      class="space-y-2 rounded-lg border p-3 text-sm"
    >
      <p>
        Board đã thay đổi. Bản nháp nhãn/checklist vẫn được giữ. Tải bản hiện
        tại để đối chiếu trước khi thay thế.
      </p>
      <Button type="button" variant="outline" :disabled="blocked" @click="reset"
        >Bỏ nháp, dùng bản hiện tại</Button
      >
      <p>
        Bản hiện tại:
        {{
          (current?.checklist ?? [])
            .map((i) => (i.done ? '✓ ' : '○ ') + i.body)
            .join('; ') || 'Checklist trống'
        }}. Nhãn:
        {{
          (current?.label_ids ?? [])
            .map(
              (id) =>
                store.snapshot?.labels?.find((l) => l.id === id)?.name ??
                'Đã xóa',
            )
            .join(', ') || 'Không có'
        }}.
      </p>
      <Button
        type="button"
        variant="outline"
        :disabled="blocked"
        @click="version = store.snapshot?.board.version ?? 0"
        >Đã đối chiếu, giữ bản nháp để lưu</Button
      >
    </div>
    <Button
      v-if="!readOnly"
      type="button"
      :disabled="blocked || !dirty || conflict"
      @click="save"
      >Lưu nhãn và checklist</Button
    >
  </section>
</template>
