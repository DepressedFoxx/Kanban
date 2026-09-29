<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'
import { authConfig } from '../config'
import AuthFeedback from '../components/AuthFeedback.vue'
const auth = useAuthStore()
const displayName = ref('')
auth.clearFeedback()
watch(
  () => auth.user?.user_metadata?.display_name,
  (value) => {
    displayName.value = typeof value === 'string' ? value : ''
  },
  { immediate: true },
)
</script>
<template>
  <main class="mx-auto max-w-2xl p-5 lg:p-9">
    <h1 class="text-2xl font-semibold">Tài khoản của bạn</h1>
    <p class="mt-2 text-sm text-muted-foreground">
      Quản lý hồ sơ và bảo mật đăng nhập.
    </p>
    <div class="mt-6 grid gap-6">
      <AuthFeedback />
      <form
        class="grid gap-4 rounded-xl border bg-card p-6"
        :aria-busy="auth.pending"
        @submit.prevent="auth.updateProfile(displayName)"
      >
        <div class="field">
          <Label for="profile-name">Tên hiển thị</Label
          ><Input
            id="profile-name"
            v-model="displayName"
            required
            autocomplete="nickname"
            :maxlength="authConfig.maxDisplayNameLength"
            :disabled="auth.pending"
          />
        </div>
        <div class="field">
          <Label for="profile-email">Email đã xác minh</Label
          ><Input id="profile-email" :model-value="auth.user?.email" readonly />
        </div>
        <Button type="submit" :disabled="auth.pending">{{
          auth.pending ? 'Đang xử lý…' : 'Lưu hồ sơ'
        }}</Button>
      </form>
      <section class="grid gap-3 rounded-xl border bg-card p-6">
        <h2 class="font-semibold">Mật khẩu</h2>
        <p class="text-sm leading-6 text-muted-foreground">
          Chúng tôi sẽ gửi liên kết đổi mật khẩu tới email của bạn.
        </p>
        <Button
          variant="outline"
          :disabled="auth.pending"
          @click="auth.requestReset(auth.user?.email ?? '')"
          >Gửi email đổi mật khẩu</Button
        >
      </section>
      <p class="text-xs leading-5 text-muted-foreground">
        Hồ sơ được lưu trên Supabase. Công việc hiện vẫn lưu trên trình duyệt
        này và chưa đồng bộ giữa các thiết bị.
      </p>
    </div>
  </main>
</template>
