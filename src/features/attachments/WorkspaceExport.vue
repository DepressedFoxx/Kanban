<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { attachmentsApi } from './api'
defineProps<{ workspace: string }>()
const busy = ref(false),
  error = ref(''),
  notice = ref('')
async function download(id: string) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const data = await attachmentsApi.export(id),
      blob = new Blob([JSON.stringify(data, null, 2) + '\n'], {
        type: 'application/json;charset=utf-8',
      }),
      url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workspace-${id}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = 'Đã xuất dữ liệu workspace.'
  } catch {
    error.value =
      'Không thể xuất dữ liệu. Kiểm tra kết nối và quyền Owner rồi thử lại.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section
    class="surface-panel mt-6 max-w-2xl space-y-4"
    aria-label="Xuất dữ liệu workspace"
  >
    <h2 class="font-semibold">Xuất dữ liệu</h2>
    <p class="text-sm text-muted-foreground">
      JSON gồm board, công việc, thành viên, bình luận và lịch sử. Chỉ chứa
      thông tin file, không chứa file gốc, email đăng nhập hoặc lời mời. Đây
      không phải bản sao lưu đầy đủ và chưa có chức năng nhập lại trong ứng
      dụng.
    </p>
    <Button variant="outline" :disabled="busy" @click="download(workspace)">{{
      busy ? 'Đang xuất…' : 'Tải bản xuất JSON'
    }}</Button>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ error }}
    </p>
    <p v-if="notice" role="status" class="text-sm">{{ notice }}</p>
  </section>
</template>
