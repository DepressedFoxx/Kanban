<script setup lang="ts">
import RefreshButton from '@/components/RefreshButton.vue'
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import ServerPagination from '@/components/ServerPagination.vue'
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
import { useMyTasksStore } from '@/stores/myTasks'
import { useAuthStore } from '@/stores/auth'
import { useCollab } from '@/features/collab/useCollab'
import { columns, priorityLabels } from '@/features/board/config'
import { labelClasses } from '@/features/tasks/productivity'
import {
  defaultFilters,
  filtersSchema,
  filtersQuery,
  parseQuery,
  myTasksError,
  myTasksConfig,
  views,
  sorts,
  type SavedFilter,
  type TaskFilters,
} from './model'
const store = useMyTasksStore(),
  auth = useAuthStore(),
  route = useRoute(),
  router = useRouter()
const form = reactive(defaultFilters()),
  validation = ref(''),
  savedName = ref(''),
  selected = ref<SavedFilter | null>(null),
  remove = ref(false)
const locked = computed(() => store.pending || !!store.uncertain)
const unapplied = computed(
  () => JSON.stringify(form) !== JSON.stringify(store.filters),
)
const choices = computed(() => store.result?.options)
const boardOptions = computed(
  () =>
    choices.value?.boards.filter(
      (b) => !form.workspace || b.workspace_id === form.workspace,
    ) ?? [],
)
const labelOptions = computed(
  () =>
    choices.value?.labels.filter(
      (l) => !form.workspace || l.workspace_id === form.workspace,
    ) ?? [],
)
const availableFilters = computed(() => [
  {
    key: 'workspace' as const,
    title: 'Workspace',
    options: choices.value?.workspaces ?? [],
  },
  { key: 'board' as const, title: 'Board', options: boardOptions.value },
  {
    key: 'status' as const,
    title: 'Trạng thái',
    options: columns.map((c) => ({ id: c.id, name: c.label })),
  },
  {
    key: 'priority' as const,
    title: 'Ưu tiên',
    options: Object.entries(priorityLabels).map(([id, name]) => ({ id, name })),
  },
  { key: 'label' as const, title: 'Nhãn', options: labelOptions.value },
])
function setFilter(
  key: 'workspace' | 'board' | 'status' | 'priority' | 'label',
  value: unknown,
) {
  const text = String(value) === 'all' ? '' : String(value)
  Object.assign(form, { [key]: text })
  if (key === 'workspace') {
    form.board = ''
    form.label = ''
  }
}
watch(
  () => route.fullPath,
  async () => {
    if (route.path !== myTasksConfig.path) return
    try {
      const parsed = parseQuery(route.query)
      Object.assign(form, parsed.filters)
      validation.value = ''
      await store.load(parsed.filters, parsed.page, false, parsed.pageSize)
    } catch {
      store.clear()
      validation.value =
        'Đường dẫn bộ lọc không hợp lệ. Xóa bộ lọc để bắt đầu lại.'
    }
  },
  { immediate: true },
)
const { online, label: connection } = useCollab(
  () => [
    { table: 'boards', event: 'UPDATE', filter: '' },
    { table: 'workspaces', event: 'UPDATE', filter: '' },
    {
      table: 'workspace_members',
      event: 'UPDATE',
      filter: `user_id=eq.${auth.user?.id}`,
    },
    {
      table: 'workspace_members',
      event: 'INSERT',
      filter: `user_id=eq.${auth.user?.id}`,
    },
  ],
  () => store.load(store.filters, store.page, true),
  () => auth.authenticated && !validation.value,
)
async function apply(page = 1, pageSize = store.pageSize) {
  if (locked.value) return
  try {
    const next = filtersSchema.parse(form)
    validation.value = ''
    const query = filtersQuery(next, page, pageSize)
    if (
      router.resolve({ path: myTasksConfig.path, query }).fullPath ===
      route.fullPath
    )
      await store.load(next, page, false, pageSize)
    else await router.replace({ path: myTasksConfig.path, query })
  } catch (cause) {
    validation.value = myTasksError(cause)
  }
}
async function reset() {
  Object.assign(form, defaultFilters())
  selected.value = null
  savedName.value = ''
  await apply()
}
async function choose(saved: SavedFilter) {
  selected.value = JSON.parse(JSON.stringify(saved))
  savedName.value = saved.name
  Object.assign(form, saved.filters)
  await apply()
}
async function save(copy = false) {
  const name = savedName.value.trim()
  if (!name || name.length > myTasksConfig.nameLength) {
    validation.value = 'Tên bộ lọc từ 1 đến 60 ký tự.'
    return
  }
  const existing = copy ? null : selected.value
  if (
    await store.save({
      id: existing?.id ?? crypto.randomUUID(),
      version: existing?.version ?? 0,
      action: 'save',
      name,
      filters: store.filters,
    })
  ) {
    selected.value = store.result?.saved.find((s) => s.name === name) ?? null
  }
}
async function deleteSaved() {
  if (!selected.value) return
  if (
    await store.save({
      id: selected.value.id,
      version: selected.value.version,
      action: 'delete',
      name: '',
      filters: defaultFilters(),
    })
  ) {
    remove.value = false
    selected.value = null
    savedName.value = ''
  }
}
async function retry() {
  const action = store.uncertain?.action,
    name = store.uncertain?.name
  if (await store.retry()) {
    remove.value = false
    selected.value =
      action === 'save'
        ? (store.result?.saved.find((s) => s.name === name) ?? null)
        : null
    if (action === 'delete') savedName.value = ''
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (locked.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function chooseView(view: TaskFilters['view']) {
  form.view = view
  void apply()
}
function deselect() {
  selected.value = null
  savedName.value = ''
}
onBeforeRouteLeave(() => !locked.value)
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
function taskTarget(task: { id: string; board_id: string }) {
  return {
    path: '/boards/' + task.board_id,
    query: {
      task: task.id,
      returnTo: router.resolve({
        path: myTasksConfig.path,
        query: filtersQuery(store.filters, store.page, store.pageSize),
      }).fullPath,
    },
  }
}
const missingScope = computed(() =>
  Boolean(
    store.result &&
    ((store.filters.workspace &&
      !choices.value?.workspaces.some(
        (w) => w.id === store.filters.workspace,
      )) ||
      (store.filters.board &&
        !choices.value?.boards.some((b) => b.id === store.filters.board)) ||
      (store.filters.label &&
        !choices.value?.labels.some((l) => l.id === store.filters.label))),
  ),
)
</script>
<template>
  <main class="workspace-page">
    <PageHeader
      title="Công việc của tôi"
      description="Việc được giao cho bạn trong các workspace đang hoạt động. Ngày hạn tính theo timezone từng workspace."
    >
      <RefreshButton
        variant="outline"
        class="transition-none"
        :disabled="store.loading || store.refreshing || locked || !online"
        @click="store.load(store.filters, store.page, true)"
        label="Tải lại danh sách"
      />
    </PageHeader>
    <p class="my-3 text-xs text-muted-foreground" role="status">
      {{ online ? connection : 'Đang offline — kết nối lại để cập nhật.'
      }}<span v-if="store.refreshing"> · Đang cập nhật…</span>
    </p>
    <div class="mb-4 flex flex-wrap gap-2" aria-label="Nhóm công việc">
      <Button
        v-for="(title, key) in views"
        :key="key"
        :variant="form.view === key ? 'default' : 'outline'"
        :aria-pressed="form.view === key"
        :disabled="locked"
        @click="chooseView(key)"
        >{{ title }}</Button
      >
    </div>
    <form class="surface-panel space-y-4" @submit.prevent="apply()">
      <div class="space-y-4">
        <div class="field">
          <Label for="my-search">Tìm tên hoặc mô tả</Label
          ><Input
            id="my-search"
            v-model="form.search"
            :maxlength="myTasksConfig.searchLength"
            :disabled="locked"
            placeholder="Nhập từ khóa…"
          />
        </div>
        <details>
          <summary class="cursor-pointer text-sm font-medium">
            Bộ lọc nâng cao ·
            {{
              [
                form.workspace,
                form.board,
                form.status,
                form.priority,
                form.label,
                form.from,
                form.to,
              ].filter(Boolean).length
            }}
            điều kiện
          </summary>
          <div class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="field in availableFilters"
              :key="field.key"
              class="field"
            >
              <Label :for="'my-' + field.key">{{ field.title }}</Label
              ><Select
                :model-value="form[field.key] || 'all'"
                :disabled="locked"
                @update:model-value="setFilter(field.key, $event)"
                ><SelectTrigger :id="'my-' + field.key" class="w-full"
                  ><SelectValue
                    :placeholder="
                      form[field.key] ? 'Mục không còn khả dụng' : 'Tất cả'
                    " /></SelectTrigger
                ><SelectContent
                  ><SelectItem value="all">Tất cả</SelectItem
                  ><SelectItem
                    v-for="option in field.options"
                    :key="option.id"
                    :value="option.id"
                    >{{ option.name }}</SelectItem
                  ></SelectContent
                ></Select
              >
            </div>
            <div class="field">
              <Label for="my-from">Hạn từ ngày</Label
              ><Input
                id="my-from"
                v-model="form.from"
                type="date"
                :disabled="locked"
              />
            </div>
            <div class="field">
              <Label for="my-to">Hạn đến ngày</Label
              ><Input
                id="my-to"
                v-model="form.to"
                type="date"
                :disabled="locked"
              />
            </div>
            <div class="field">
              <Label for="my-sort">Sắp xếp</Label
              ><Select v-model="form.sort" :disabled="locked"
                ><SelectTrigger id="my-sort" class="w-full"
                  ><SelectValue /></SelectTrigger
                ><SelectContent
                  ><SelectItem
                    v-for="(title, key) in sorts"
                    :key="key"
                    :value="key"
                    >{{ title }}</SelectItem
                  ></SelectContent
                ></Select
              >
            </div>
          </div>
        </details>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button type="submit" :disabled="locked || !online"
          >Áp dụng bộ lọc</Button
        ><Button
          variant="outline"
          type="button"
          :disabled="locked"
          @click="reset"
          >Xóa bộ lọc</Button
        ><span v-if="unapplied" class="text-sm text-muted-foreground"
          >Bộ lọc đang nhập chưa áp dụng.</span
        >
      </div>
    </form>
    <p v-if="validation" role="alert" class="mt-3 text-sm text-destructive">
      {{ validation }}
    </p>
    <p v-if="store.error" role="alert" class="mt-3 text-sm text-destructive">
      {{ store.error }}
    </p>
    <p v-if="missingScope" role="status" class="mt-3 text-sm">
      Workspace, board hoặc nhãn đã chọn không còn khả dụng. Xóa bộ lọc hoặc
      chọn mục khác.
    </p>
    <details class="my-4 rounded-xl border bg-card p-4">
      <summary class="cursor-pointer font-medium">
        Bộ lọc đã lưu ({{ store.result?.saved.length ?? 0 }}/{{
          myTasksConfig.maxSaved
        }})
      </summary>
      <p class="my-3 text-sm text-muted-foreground">
        Chỉ bạn nhìn thấy các bộ lọc này. Lưu điều kiện đang áp dụng, không lưu
        nội dung task.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="saved in store.result?.saved ?? []"
          :key="saved.id"
          variant="outline"
          :aria-pressed="selected?.id === saved.id"
          :disabled="locked"
          @click="choose(saved)"
          >{{ saved.name }}</Button
        >
      </div>
      <div class="mt-3 grid gap-2">
        <Label for="saved-name">Tên bộ lọc</Label
        ><Input
          id="saved-name"
          v-model="savedName"
          :maxlength="myTasksConfig.nameLength"
          :disabled="locked"
          placeholder="Ví dụ: Việc ưu tiên tuần này"
        />
        <div class="flex flex-wrap gap-2">
          <Button
            :disabled="
              locked ||
              store.loading ||
              !store.result ||
              unapplied ||
              !savedName.trim() ||
              !online
            "
            @click="save()"
            >{{ selected ? 'Cập nhật bộ lọc' : 'Lưu bộ lọc mới' }}</Button
          ><Button
            v-if="selected"
            variant="outline"
            :disabled="locked || !store.result || unapplied || !online"
            @click="save(true)"
            >Lưu thành bản mới</Button
          ><Button
            v-if="selected"
            variant="outline"
            :disabled="locked || !online"
            @click="remove = true"
            >Xóa bộ lọc đã lưu</Button
          ><Button
            v-if="selected"
            variant="ghost"
            :disabled="locked"
            @click="deselect"
            >Bỏ chọn bộ lọc đã lưu</Button
          >
        </div>
      </div>
    </details>
    <p
      v-if="store.writeError"
      role="alert"
      class="my-3 text-sm text-destructive"
    >
      {{ store.writeError }}
    </p>
    <p v-if="store.notice" role="status" class="my-3 text-sm">
      {{ store.notice }}
    </p>
    <Button
      v-if="store.uncertain"
      :disabled="store.pending || !online"
      @click="retry"
      >Xác nhận lại lưu bộ lọc</Button
    >
    <p v-if="store.loading" role="status">Đang tải công việc…</p>
    <template v-if="store.result">
      <p class="my-4 text-sm" role="status">
        {{ store.result.total }} công việc · Trang {{ store.page }}/{{
          Math.max(1, Math.ceil(store.result.total / store.pageSize))
        }}
      </p>
      <section
        v-if="!store.result.items.length"
        class="surface-panel text-center shadow-sm"
      >
        <h2 class="font-semibold">Không có công việc phù hợp</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Thử đổi điều kiện lọc. Chỉ công việc được giao cho bạn và chưa lưu trữ
          mới xuất hiện ở đây.
        </p>
      </section>
      <ul v-else class="grid gap-3 lg:grid-cols-2">
        <li
          v-for="task in store.result.items"
          :key="task.id"
          class="min-w-0 rounded-xl border bg-card p-4"
        >
          <RouterLink
            :to="taskTarget(task)"
            class="break-words font-semibold text-primary underline-offset-4 hover:underline"
            >{{ task.title }}</RouterLink
          >
          <p class="mt-1 break-words text-xs text-muted-foreground">
            {{ task.workspace_name }} / {{ task.board_name }}
          </p>
          <p class="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-sm">
            {{ task.description }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2 text-xs">
            <span class="rounded bg-muted px-2 py-1">{{
              columns.find((c) => c.id === task.status)?.label
            }}</span
            ><span class="rounded bg-muted px-2 py-1"
              >Ưu tiên {{ priorityLabels[task.priority] }}</span
            ><span
              v-for="label in task.labels"
              :key="label.id"
              class="rounded px-2 py-1"
              :class="labelClasses[label.color]"
              >{{ label.name }}</span
            >
          </div>
          <p
            class="mt-3 text-xs"
            :class="task.overdue ? 'text-destructive' : 'text-muted-foreground'"
          >
            {{ task.overdue ? 'Quá hạn · ' : ''
            }}{{ task.due_date ? 'Hạn ' + task.due_date : 'Chưa có hạn' }} ·
            {{ task.timezone }}
          </p>
        </li>
      </ul>
      <ServerPagination
        :page="store.page"
        :page-size="store.pageSize"
        :total="store.result.total"
        :disabled="locked || store.loading || !online || unapplied"
        label="Phân trang công việc"
        @change="apply"
      />
    </template>
    <AlertDialog
      :open="remove"
      @update:open="
        (v) => {
          if (!v && !locked) remove = false
        }
      "
      ><AlertDialogContent
        ><AlertDialogTitle>Xóa bộ lọc đã lưu?</AlertDialogTitle
        ><AlertDialogDescription
          >Chỉ xóa bộ lọc cá nhân “{{ selected?.name }}”. Công việc vẫn được giữ
          nguyên.</AlertDialogDescription
        >
        <p v-if="store.writeError" role="alert">{{ store.writeError }}</p>
        <AlertDialogFooter
          ><AlertDialogCancel :disabled="locked">Hủy</AlertDialogCancel
          ><Button :disabled="locked || !online" @click="deleteSaved"
            >Xác nhận xóa bộ lọc</Button
          ></AlertDialogFooter
        ><Button
          v-if="store.uncertain"
          :disabled="store.pending || !online"
          @click="retry"
          >Xác nhận lại lưu bộ lọc</Button
        ></AlertDialogContent
      ></AlertDialog
    >
  </main>
</template>
