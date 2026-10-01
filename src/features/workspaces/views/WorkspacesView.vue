<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import { onMounted, ref } from 'vue'
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
onMounted(() => store.load())
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
      <Button
        variant="outline"
        :disabled="store.loading || store.pending"
        @click="store.load()"
        >Tải lại</Button
      >
    </PageHeader>
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
    <p v-if="store.loading" role="status" class="mt-6 text-sm">
      Đang tải workspace…
    </p>
    <p
      v-else-if="!store.error && !store.workspaces.length"
      class="mt-6 rounded-xl border border-dashed p-8 text-center text-muted-foreground"
    >
      Bạn chưa tham gia workspace nào. Tạo workspace hoặc mở link lời mời.
    </p>
    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2">
      <RouterLink
        v-for="workspace in store.workspaces"
        :key="workspace.id"
        :to="`/workspaces/${workspace.id}/boards`"
        class="min-w-0 rounded-xl border bg-card p-5 transition-colors hover:bg-accent"
        ><span class="text-xs text-muted-foreground">{{
          roleLabels[workspace.role]
        }}</span>
        <h2 class="mt-2 break-words text-lg font-semibold">
          {{ workspace.name }}
        </h2>
        <p class="mt-3 text-sm text-primary">Xem board →</p></RouterLink
      >
    </div>
  </main>
</template>
