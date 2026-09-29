<script setup lang="ts">
import { appConfig } from '@/config/app'
import { authLinkError } from '@/lib/supabase'
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authConfig } from '../config'
const auth = useAuthStore()
const router = useRouter()
const failed = ref(false)
onMounted(async () => {
  await auth.initialize()
  if (auth.authenticated && !authLinkError && !auth.initializationError)
    await router.replace(
      auth.recovering ? authConfig.routes.reset : appConfig.routes.board,
    )
  else failed.value = true
})
</script>
<template>
  <main class="mx-auto grid min-h-dvh max-w-md content-center gap-4 p-6">
    <h1 class="text-2xl font-semibold">Xác minh tài khoản</h1>
    <p role="status">
      {{
        failed
          ? 'Không xác minh được liên kết. Liên kết có thể đã hết hạn hoặc được sử dụng.'
          : 'Đang kiểm tra phiên đăng nhập…'
      }}
    </p>
    <RouterLink
      v-if="failed"
      :to="authConfig.routes.login"
      class="text-primary underline"
      >Đăng nhập hoặc gửi lại email xác minh</RouterLink
    >
  </main>
</template>
