<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspaces'
import { workspaceApi } from '../api'
import { workspaceError } from '../model'
import { workspaceConfig } from '../config'
import { authConfig } from '@/features/auth/config'
const auth = useAuthStore()
const store = useWorkspaceStore()
const route = useRoute()
const router = useRouter()
store.clear()
const preview = ref<Awaited<ReturnType<typeof workspaceApi.preview>> | null>(
  null,
)
const previewError = ref('')
const previewLoading = ref(false)
let generation = 0
async function loadPreview() {
  const request = ++generation
  preview.value = null
  previewError.value = ''
  previewLoading.value = true
  try {
    const result = await workspaceApi.preview(String(route.params.token))
    if (request === generation) preview.value = result
  } catch (error) {
    if (request === generation) previewError.value = workspaceError(error)
  } finally {
    if (request === generation) previewLoading.value = false
  }
}
watch(() => [route.params.token, auth.user?.id], loadPreview, {
  immediate: true,
})
onBeforeUnmount(() => {
  generation++
  store.clear()
})
async function accept() {
  if (!preview.value || previewLoading.value) return
  const result = await store.mutate(() =>
    workspaceApi.accept(String(route.params.token)),
  )
  if (result) await router.replace(workspaceConfig.detailPath(result.value))
}
async function switchAccount() {
  const destination = route.path
  if (await auth.logout())
    await router.replace({
      path: authConfig.routes.login,
      query: { redirect: destination },
    })
}
</script>
<template>
  <main class="mx-auto grid max-w-lg gap-5 p-6 lg:py-16">
    <h1 class="text-2xl font-semibold">Tham gia workspace</h1>
    <p class="text-sm leading-6 text-muted-foreground">
      Bạn đang đăng nhập bằng {{ auth.user?.email }}. Chỉ email được Owner mời
      mới có thể sử dụng liên kết này.
    </p>
    <p v-if="store.error" role="alert" class="text-sm text-destructive">
      {{ store.error }}
    </p>
    <p v-if="previewLoading" role="status">Đang tải thông tin lời mời…</p>
    <div v-if="previewError" role="alert">
      <p>{{ previewError }}</p>
      <Button variant="outline" class="mt-3" @click="loadPreview"
        >Thử lại</Button
      >
    </div>
    <section v-if="preview" class="rounded-xl border bg-card p-4">
      <h2 class="break-words text-lg font-semibold">
        {{ preview.workspace_name }}
      </h2>
      <p class="mt-2">
        Vai trò:
        {{
          preview.role === 'member'
            ? 'Member — tạo, sửa công việc và bình luận'
            : 'Viewer — chỉ xem'
        }}
      </p>
      <p class="mt-2 text-sm text-muted-foreground">
        Hết hạn: {{ new Date(preview.expires_at).toLocaleString('vi-VN') }}
      </p>
    </section>
    <Button
      :disabled="store.pending || previewLoading || !preview"
      @click="accept"
      >{{
        store.pending ? 'Đang kiểm tra lời mời…' : 'Chấp nhận lời mời'
      }}</Button
    ><Button
      variant="outline"
      :disabled="store.pending || auth.pending"
      @click="switchAccount"
      >Đăng nhập tài khoản khác</Button
    ><RouterLink
      :to="workspaceConfig.listPath"
      class="text-sm text-primary underline"
      >Về danh sách workspace</RouterLink
    >
  </main>
</template>
