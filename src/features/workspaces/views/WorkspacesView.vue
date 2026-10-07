<script setup lang="ts">
import RefreshButton from '@/components/RefreshButton.vue'
import { Search, ArrowRight } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import { onMounted, ref, watch } from 'vue'
import ServerPagination from '@/components/ServerPagination.vue'
import { useServerList } from '@/lib/useServerList'
import { workspaceSchema } from '../model'
import { RouterLink, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWorkspaceStore } from '@/stores/workspaces'
import { workspaceApi } from '../api'
import { workspaceConfig, roleLabels } from '../config'
const store = useWorkspaceStore()
const router = useRouter()
const name = ref('')
const archived = ref(false)
const {
  items: shown,
  page,
  pageSize,
  total,
  filters,
  loading,
  error,
  load,
} = useServerList('workspaces', workspaceSchema)
const search = ref('')
function refresh() {
  filters.value = { archived: archived.value, search: search.value }
  return load(1)
}
watch(archived, refresh)
onMounted(refresh)
async function create() {
  const result = await store.mutate(() => workspaceApi.create(name.value))
  if (result) await router.push(workspaceConfig.detailPath(result.value))
}
</script>
<template>
  <main class="workspace-page">
    <PageHeader
      title="Workspace của bạn"
      description="Tạo không gian riêng và mời thành viên cùng tham gia."
    >
      <RefreshButton
        variant="outline"
        :disabled="loading || store.pending"
        @click="refresh"
        label="Tải lại"
      />
    </PageHeader>
    <form class="my-4 flex items-center gap-2" @submit.prevent="refresh">
      <Input
        v-model="search"
        aria-label="Tìm workspace"
        placeholder="Tìm workspace…"
      /><Button
        type="submit"
        size="icon"
        aria-label="Tìm workspace"
        title="Tìm workspace"
        :disabled="loading"
        ><Search aria-hidden="true"
      /></Button>
    </form>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p
      v-if="store.error"
      role="alert"
      class="mt-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
    >
      {{ store.error }}
    </p>
    <form
      class="mt-6 grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-end"
      @submit.prevent="create"
    >
      <div class="field">
        <Label for="workspace-name">Tên workspace mới</Label
        ><Input
          id="workspace-name"
          v-model="name"
          placeholder="Ví dụ: Dự án cá nhân"
          :maxlength="workspaceConfig.nameMaxLength"
          required
          :disabled="store.pending"
        />
      </div>
      <Button
        type="submit"
        :disabled="store.pending || store.loading || !name.trim()"
        >{{ store.pending ? 'Đang tạo…' : 'Tạo workspace' }}</Button
      >
    </form>
    <p v-if="loading" role="status" class="mt-6 text-sm">Đang tải workspace…</p>
    <p
      v-else-if="!error && !shown.length"
      class="mt-6 rounded-xl border border-dashed p-8 text-center text-muted-foreground"
    >
      {{
        search || archived
          ? 'Không có workspace phù hợp. Thử đổi từ khóa hoặc trạng thái.'
          : 'Bạn chưa tham gia workspace nào. Tạo workspace hoặc mở link lời mời.'
      }}
    </p>
    <Button variant="outline" class="mt-4" @click="archived = !archived">{{
      archived ? 'Xem workspace hoạt động' : 'Xem workspace đã lưu trữ'
    }}</Button>
    <div class="mt-6 grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="workspace in shown"
        :key="workspace.id"
        :to="`/workspaces/${workspace.id}/boards`"
        class="min-w-0 rounded-xl border bg-card p-5 transition-colors hover:bg-accent"
        ><span class="text-xs text-muted-foreground">{{
          roleLabels[workspace.role]
        }}</span>
        <h2 class="mt-2 break-words text-lg font-semibold">
          {{ workspace.name }}
        </h2>
        <p class="mt-3 text-sm text-primary">
          Xem board
          <ArrowRight class="ml-1 inline size-4" aria-hidden="true" /></p
      ></RouterLink>
    </div>
    <ServerPagination
      v-if="!error"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :disabled="loading"
      @change="load"
    />
  </main>
</template>
