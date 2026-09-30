<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
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
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useWorkspaceStore } from '@/stores/workspaces'
import { workspaceApi } from '../api'
import { workspaceConfig, roleLabels } from '../config'
import { invitationStatus, type Member } from '../model'
const route = useRoute()
const store = useWorkspaceStore()
const id = String(route.params.workspaceId)
const name = ref('')
const email = ref('')
const role = ref('member')
const invitationUrl = ref('')
const copyStatus = ref('')
const removing = ref<Member | null>(null)
const confirmOpen = computed({
  get: () => Boolean(removing.value),
  set: (open: boolean) => {
    if (!open) removing.value = null
  },
})
async function refresh() {
  invitationUrl.value = ''
  copyStatus.value = ''
  if (await store.load(id)) name.value = store.current?.name ?? ''
}
onMounted(refresh)
// Revalidate on focus and periodically; server enforces permissions on every RPC.
const timer = window.setInterval(() => {
  if (!document.hidden && !store.pending && !store.loading) void revalidate()
}, 30000)
async function revalidate() {
  if (store.pending || store.loading) return
  const oldName = store.current?.name
  await store.load(id)
  if (name.value === oldName) name.value = store.current?.name ?? ''
  if (!store.owner) {
    invitationUrl.value = ''
    removing.value = null
  }
}
function focus() {
  void revalidate()
}
window.addEventListener('focus', focus)
onBeforeUnmount(() => {
  window.clearInterval(timer)
  window.removeEventListener('focus', focus)
  store.clear()
})
async function rename() {
  if (await store.mutate(() => workspaceApi.rename(id, name.value))) {
    await refresh()
    store.notice = 'Đã đổi tên workspace.'
  }
}
async function invite() {
  invitationUrl.value = ''
  copyStatus.value = ''
  const result = await store.mutate(() =>
    workspaceApi.invite(id, email.value, role.value),
  )
  if (result) {
    await store.load(id)
    if (store.owner)
      invitationUrl.value = new URL(
        workspaceConfig.invitePath(result.value),
        window.location.origin,
      ).href
    email.value = ''
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(invitationUrl.value)
    copyStatus.value = 'Đã sao chép link.'
  } catch {
    copyStatus.value =
      'Không thể tự sao chép. Hãy chọn link và sao chép thủ công.'
  }
}
async function changeRole(user: string, value: unknown) {
  if (
    await store.mutate(() => workspaceApi.changeRole(id, user, String(value)))
  ) {
    await store.load(id)
    store.notice = 'Đã cập nhật vai trò.'
  }
}
async function remove() {
  if (!removing.value) return
  const user = removing.value.user_id
  if (await store.mutate(() => workspaceApi.remove(id, user))) {
    removing.value = null
    await store.load(id)
    store.notice = 'Đã gỡ thành viên.'
  }
}
async function revoke(invitation: string) {
  if (await store.mutate(() => workspaceApi.revoke(id, invitation))) {
    invitationUrl.value = ''
    await store.load(id)
    store.notice = 'Đã thu hồi lời mời.'
  }
}
</script>
<template>
  <main class="mx-auto max-w-5xl p-5 lg:p-9">
    <RouterLink
      :to="workspaceConfig.listPath"
      class="text-sm text-primary underline"
      >← Đổi workspace</RouterLink
    >
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="break-words text-2xl font-semibold">
        {{ store.current?.name ?? 'Thành viên workspace' }}
      </h1>
      <Button
        variant="outline"
        :disabled="store.loading || store.pending"
        @click="refresh"
        >Tải lại</Button
      >
    </div>
    <p v-if="store.loading" role="status" class="mt-5">
      Đang kiểm tra quyền truy cập…
    </p>
    <p
      v-if="store.error"
      role="alert"
      class="mt-5 rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
    >
      {{ store.error }}
    </p>
    <p v-if="store.notice" role="status" class="mt-5 text-sm text-primary">
      {{ store.notice }}
    </p>
    <template v-if="store.current">
      <p class="mt-2 text-sm text-muted-foreground">
        Vai trò của bạn: {{ roleLabels[store.current.role] }}. Chỉ Owner được
        quản lý thành viên và lời mời.
      </p>
      <form
        v-if="store.owner"
        class="mt-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-5"
        @submit.prevent="rename"
      >
        <div class="field min-w-0 flex-1">
          <Label for="rename-workspace">Tên workspace</Label
          ><Input
            id="rename-workspace"
            v-model="name"
            :maxlength="workspaceConfig.nameMaxLength"
            required
          />
        </div>
        <Button type="submit" :disabled="store.pending || !name.trim()"
          >Lưu tên</Button
        >
      </form>
      <section class="mt-6">
        <h2 class="text-lg font-semibold">
          Thành viên ({{ store.members.length }})
        </h2>
        <ul class="mt-3 divide-y rounded-xl border bg-card">
          <li
            v-for="member in store.members"
            :key="member.user_id"
            class="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div class="min-w-0">
              <p class="break-words font-medium">
                {{ member.display_name || member.email }}
              </p>
              <p class="break-all text-sm text-muted-foreground">
                {{ member.email }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <template v-if="store.owner && member.role !== 'owner'"
                ><Select
                  :model-value="member.role"
                  :disabled="store.pending"
                  @update:model-value="changeRole(member.user_id, $event)"
                  ><SelectTrigger
                    class="w-32"
                    :aria-label="'Vai trò của ' + member.email"
                    ><SelectValue /></SelectTrigger
                  ><SelectContent
                    ><SelectItem value="member">Member</SelectItem
                    ><SelectItem value="viewer"
                      >Viewer</SelectItem
                    ></SelectContent
                  ></Select
                ><Button
                  variant="ghost"
                  class="text-destructive"
                  :disabled="store.pending"
                  @click="removing = member"
                  >Gỡ</Button
                ></template
              ><span v-else class="rounded-md bg-muted px-3 py-1 text-sm">{{
                roleLabels[member.role]
              }}</span>
            </div>
          </li>
        </ul>
      </section>
      <section v-if="store.owner" class="mt-6 rounded-xl border bg-card p-5">
        <h2 class="text-lg font-semibold">Mời thành viên</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Link có hiệu lực {{ workspaceConfig.invitationDays }} ngày, chỉ dành
          cho email được mời. Bạn tự gửi link cho người nhận; ứng dụng không gửi
          email.
        </p>
        <form
          class="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"
          @submit.prevent="invite"
        >
          <div class="field">
            <Label for="invite-email">Email người nhận</Label
            ><Input
              id="invite-email"
              v-model="email"
              type="email"
              maxlength="254"
              required
            />
          </div>
          <div class="field">
            <Label for="invite-role">Vai trò</Label
            ><Select v-model="role"
              ><SelectTrigger id="invite-role" class="w-full"
                ><SelectValue /></SelectTrigger
              ><SelectContent
                ><SelectItem value="member">Member</SelectItem
                ><SelectItem value="viewer">Viewer</SelectItem></SelectContent
              ></Select
            >
          </div>
          <Button type="submit" :disabled="store.pending || !email.trim()"
            >Tạo link mời</Button
          >
        </form>
        <div v-if="invitationUrl" class="mt-4 grid gap-2">
          <Label for="invite-link"
            >Link vừa tạo — sao chép trước khi rời trang</Label
          ><Input
            id="invite-link"
            :model-value="invitationUrl"
            readonly
          /><Button variant="outline" @click="copy">Sao chép link</Button>
          <p role="status" class="text-sm">{{ copyStatus }}</p>
        </div>
        <p class="mt-3 text-xs text-muted-foreground">
          Tạo lại lời mời cho cùng email sẽ vô hiệu hóa link cũ. Khi dùng chung,
          ứng dụng phải được triển khai trên địa chỉ người nhận truy cập được.
        </p>
        <ul class="mt-5 divide-y">
          <li
            v-for="invitation in store.invitations"
            :key="invitation.id"
            class="flex flex-wrap items-center justify-between gap-2 py-3"
          >
            <div class="min-w-0">
              <p class="break-all text-sm">
                {{ invitation.email }} · {{ roleLabels[invitation.role] }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ invitationStatus(invitation) }}
              </p>
            </div>
            <Button
              v-if="invitationStatus(invitation) === 'Đang chờ'"
              variant="outline"
              size="sm"
              :disabled="store.pending"
              @click="revoke(invitation.id)"
              >Thu hồi</Button
            >
          </li>
        </ul>
      </section>
      <p class="mt-6 text-sm text-muted-foreground">
        Board của workspace lưu trên Supabase. Mở danh sách board để quản lý
        công việc của nhóm.
      </p>
    </template>
    <AlertDialog v-model:open="confirmOpen"
      ><AlertDialogContent
        ><AlertDialogHeader
          ><AlertDialogTitle>Gỡ thành viên?</AlertDialogTitle
          ><AlertDialogDescription
            >{{ removing?.email }} sẽ mất quyền truy cập workspace. Bạn có thể
            mời lại sau.</AlertDialogDescription
          ></AlertDialogHeader
        ><AlertDialogFooter
          ><AlertDialogCancel :disabled="store.pending">Hủy</AlertDialogCancel
          ><AlertDialogAction
            :disabled="store.pending"
            class="bg-destructive text-white"
            @click.prevent="remove"
            >Gỡ thành viên</AlertDialogAction
          ></AlertDialogFooter
        ></AlertDialogContent
      ></AlertDialog
    >
  </main>
</template>
