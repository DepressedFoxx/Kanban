<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceStore } from '@/stores/workspaces'
import { workspaceApi } from '../api'
import { workspaceConfig } from '../config'
import { authConfig } from '@/features/auth/config'
const auth = useAuthStore()
const store = useWorkspaceStore()
const route = useRoute()
const router = useRouter()
store.clear()
onBeforeUnmount(() => store.clear())
async function accept() {
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
    <Button :disabled="store.pending" @click="accept">{{
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
