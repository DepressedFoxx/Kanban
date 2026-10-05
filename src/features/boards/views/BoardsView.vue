<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWorkspaceStore } from '@/stores/workspaces'
import { boardsApi } from '../api'
import { boardConfig, boardError, type OnlineBoard } from '../model'
const workspace = useWorkspaceStore(),
  route = useRoute(),
  router = useRouter()
const id = String(route.params.workspaceId)
const items = ref<OnlineBoard[]>([]),
  name = ref(''),
  error = ref(''),
  loading = ref(true),
  pending = ref(false),
  archived = ref(false)
const attempt = ref<{ id: string; name: string } | null>(null)
const canCreate = computed(
  () =>
    ['owner', 'member'].includes(workspace.current?.role ?? '') &&
    !workspace.current?.archived_at,
)
let active = true
const shown = computed(() =>
  items.value.filter((b) => Boolean(b.archived_at) === archived.value),
)
async function refresh() {
  if (pending.value) return
  loading.value = true
  error.value = ''
  items.value = []
  try {
    if (!(await workspace.load(id))) return
    const result = await boardsApi.list(id)
    if (active) items.value = result
  } catch (cause) {
    if (active) error.value = boardError(cause)
  } finally {
    if (active) loading.value = false
  }
}
async function create() {
  if (
    pending.value ||
    loading.value ||
    !canCreate.value ||
    workspace.current?.archived_at
  )
    return
  pending.value = true
  error.value = ''
  attempt.value ??= { id: crypto.randomUUID(), name: name.value.trim() }
  try {
    const created = await boardsApi.create(
      id,
      attempt.value.id,
      attempt.value.name,
    )
    if (active) await router.push(boardConfig.detailPath(created))
  } catch (cause) {
    if (active) {
      error.value = boardError(cause)
      const code = (cause as { code?: string })?.code
      if (code && /^(22|23|42|PGRST)/.test(code)) attempt.value = null
    }
  } finally {
    if (active) pending.value = false
  }
}
onMounted(refresh)
onBeforeUnmount(() => {
  active = false
  workspace.clear()
})
</script>
<template>
  <main class="workspace-page">
    <RouterLink to="/workspaces" class="text-sm text-primary"
      >← Đổi workspace</RouterLink
    >
    <p v-if="workspace.current?.archived_at" role="status" class="mt-4">
      Workspace đã lưu trữ — chỉ đọc.
    </p>
    <Button as-child variant="outline" class="mt-3"
      ><RouterLink :to="`/workspaces/${id}/settings`"
        >Cài đặt workspace</RouterLink
      ></Button
    >
    <PageHeader :title="'Board · ' + (workspace.current?.name || 'Workspace')">
      <Button as-child variant="outline"
        ><RouterLink :to="`/workspaces/${id}/members`"
          >Thành viên</RouterLink
        ></Button
      ><Button variant="outline" :disabled="loading || pending" @click="refresh"
        >Tải lại</Button
      >
    </PageHeader>
    <p
      v-if="error || workspace.error"
      role="alert"
      class="mt-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
    >
      {{ error || workspace.error }}
    </p>
    <form
      v-if="canCreate"
      class="mt-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-5"
      @submit.prevent="create"
    >
      <div class="field min-w-0 flex-1">
        <Label for="board-name">Tên board mới</Label
        ><Input
          id="board-name"
          v-model="name"
          :maxlength="boardConfig.nameMaxLength"
          :disabled="pending || !!attempt"
          required
          placeholder="Ví dụ: Website khách hàng"
        />
      </div>
      <Button type="submit" :disabled="pending || loading || !name.trim()">{{
        pending
          ? 'Đang tạo…'
          : attempt
            ? 'Xác nhận lại thao tác tạo'
            : 'Tạo board'
      }}</Button>
    </form>
    <div class="mt-6 flex gap-2">
      <Button
        :variant="!archived ? 'default' : 'outline'"
        @click="archived = false"
        >Đang hoạt động</Button
      ><Button
        :variant="archived ? 'default' : 'outline'"
        @click="archived = true"
        >Đã lưu trữ</Button
      >
    </div>
    <p v-if="loading" role="status" class="mt-6">Đang tải board…</p>
    <p
      v-else-if="!error && !workspace.error && !shown.length"
      class="mt-6 rounded-xl border border-dashed p-8 text-center text-muted-foreground"
    >
      {{
        archived
          ? 'Chưa có board lưu trữ.'
          : 'Chưa có board. Owner có thể tạo board đầu tiên.'
      }}
    </p>
    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="board in shown"
        :key="board.id"
        :to="boardConfig.detailPath(board.id)"
        class="min-w-0 rounded-xl border bg-card p-5 hover:bg-accent"
        ><h2 class="break-words text-lg font-semibold">{{ board.name }}</h2>
        <p class="mt-3 text-sm text-muted-foreground">
          {{
            board.archived_at ? 'Chỉ đọc · Đã lưu trữ' : 'Mở bảng công việc →'
          }}
        </p></RouterLink
      >
    </div>
  </main>
</template>
