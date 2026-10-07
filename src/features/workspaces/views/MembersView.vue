<script setup lang="ts">
import RefreshButton from '@/components/RefreshButton.vue'
import { Search, ArrowLeft } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import ServerPagination from '@/components/ServerPagination.vue'
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
store.paged = true
function peoplePage(page: number, pageSize: number) {
  Object.assign(store.peoplePage, { page, pageSize })
  return store.load(id)
}
function invitesPage(page: number, pageSize: number) {
  Object.assign(store.invitesPage, { page, pageSize })
  return store.load(id)
}
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
  await store.load(id)
}
onMounted(refresh)
// Revalidate on focus and periodically; server enforces permissions on every RPC.
const timer = window.setInterval(() => {
  if (!document.hidden && !store.pending && !store.loading) void revalidate()
}, 30000)
async function revalidate() {
  if (store.pending || store.loading) return
  await store.load(id)
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
  <main class="workspace-page">
    <nav
      class="page-navigation"
      aria-label="Điều hướng workspace"
    >
      <Button as-child variant="outline"
        ><RouterLink :to="`/workspaces/${id}/settings`"
          >Cài đặt workspace</RouterLink
        ></Button
      >
      <Button as-child variant="outline"
        ><RouterLink :to="`/workspaces/${id}/boards`"
          >Board của workspace</RouterLink
        ></Button
      >
      <RouterLink
        :to="workspaceConfig.listPath"
        class="text-sm text-primary underline"
        ><ArrowLeft class="mr-1 inline size-4" aria-hidden="true" />Đổi
        workspace</RouterLink
      >
    </nav>
    <p v-if="store.current?.archived_at" role="status" class="mt-4">
      Workspace đã lưu trữ. Không thể mời hoặc đổi vai trò; Owner vẫn có thể gỡ
      thành viên và thu hồi lời mời.
    </p>
    <PageHeader title="Thành viên" :description="store.current?.name">
      <RefreshButton
        variant="outline"
        :disabled="store.loading || store.pending"
        @click="refresh"
        label="Tải lại"
      />
    </PageHeader>
    <p v-if="store.loading && !store.current" role="status" class="mt-5">
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
      <section class="mt-6">
        <h2 class="text-lg font-semibold">
          Thành viên ({{ store.peoplePage.total }})
        </h2>
        <form
          class="my-3 flex gap-2"
          @submit.prevent="peoplePage(1, store.peoplePage.pageSize)"
        >
          <Input
            v-model="store.peoplePage.search"
            aria-label="Tìm thành viên"
            placeholder="Tìm thành viên…"
          /><Button
            type="submit"
            size="icon"
            aria-label="Tìm thành viên"
            title="Tìm thành viên"
            :disabled="store.loading"
            ><Search aria-hidden="true"
          /></Button>
        </form>
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
                  :disabled="store.pending || !!store.current?.archived_at"
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
        <ServerPagination
          :page="store.peoplePage.page"
          :page-size="store.peoplePage.pageSize"
          :total="store.peoplePage.total"
          :disabled="store.loading || store.pending"
          label="Phân trang thành viên"
          @change="peoplePage"
        />
      </section>
      <section v-if="store.owner" class="mt-6 rounded-xl border bg-card p-5">
        <h2 class="text-lg font-semibold">Mời thành viên</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Member: tạo, sửa task và bình luận. Viewer: chỉ xem. Owner: quản lý
          workspace và thành viên.
        </p>
        <p class="mt-2 text-sm text-muted-foreground">
          Link có hiệu lực {{ workspaceConfig.invitationDays }} ngày, chỉ dành
          cho email được mời. Bạn tự gửi link cho người nhận; ứng dụng không gửi
          email.
        </p>
        <form
          class="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end"
          v-if="!store.current?.archived_at"
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
        <form
          class="my-3 flex gap-2"
          @submit.prevent="invitesPage(1, store.invitesPage.pageSize)"
        >
          <Input
            v-model="store.invitesPage.search"
            aria-label="Tìm lời mời"
            placeholder="Tìm email lời mời…"
          /><Button
            type="submit"
            size="icon"
            aria-label="Tìm lời mời"
            title="Tìm lời mời"
            :disabled="store.loading"
            ><Search aria-hidden="true"
          /></Button>
        </form>
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
        <ServerPagination
          :page="store.invitesPage.page"
          :page-size="store.invitesPage.pageSize"
          :total="store.invitesPage.total"
          :disabled="store.loading || store.pending"
          label="Phân trang lời mời"
          @change="invitesPage"
        />
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
