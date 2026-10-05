<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useNotificationsStore } from '@/stores/notifications'
import {
  kindLabels,
  preferenceLabels,
  type Preferences,
  type Notification,
} from './model'
const store = useNotificationsStore(),
  prefs = ref<Preferences | null>(null),
  dirty = ref(false),
  invitation = ref<Notification | null>(null)
const locked = computed(() => store.pending || !!store.uncertain)
const cursors = ref<(string | null)[]>([])
watch(
  () => store.feed?.preferences,
  (p) => {
    if (
      p &&
      (!dirty.value ||
        (prefs.value &&
          p.assignments === prefs.value.assignments &&
          p.comments === prefs.value.comments &&
          p.invitations === prefs.value.invitations))
    ) {
      prefs.value = { ...p }
      dirty.value = false
    }
  },
  { immediate: true },
)
watch(
  () => [store.feed, store.pending, store.uncertain],
  () => {
    if (
      !locked.value &&
      invitation.value &&
      !store.feed?.items.some((n) => n.id === invitation.value?.id)
    )
      invitation.value = null
  },
)
void store.load(null, false)
function togglePreference(key: keyof typeof preferenceLabels) {
  if (prefs.value) {
    prefs.value[key] = !prefs.value[key]
    dirty.value = true
  }
}
async function savePreferences() {
  if (prefs.value && (await store.mutate('preferences', { ...prefs.value }))) {
    dirty.value = false
    prefs.value = store.feed ? { ...store.feed.preferences } : null
  }
}
function resetPreferences() {
  dirty.value = false
  prefs.value = store.feed ? { ...store.feed.preferences } : null
}
async function select(unread: boolean) {
  cursors.value = []
  await store.load(null, unread)
}
async function next() {
  if (store.feed?.next) {
    cursors.value.push(store.before)
    await store.load(store.feed.next)
  }
}
async function previous() {
  await store.load(cursors.value.pop() ?? null)
}
async function accept() {
  if (
    invitation.value?.invitation_id &&
    (await store.accept(invitation.value.invitation_id))
  )
    invitation.value = null
}
function setInvitationOpen(open: boolean) {
  if (!open && !locked.value) invitation.value = null
}
</script>
<template>
  <main class="workspace-page">
    <PageHeader
      title="Thông báo"
      description="Việc được giao, bình luận đang theo dõi và lời mời workspace. Chỉ hiển thị nội dung bạn còn quyền xem."
    >
      <Button
        variant="outline"
        :disabled="locked || store.loading || store.refreshing"
        @click="store.load(store.before, store.unreadOnly, true)"
        >Tải lại thông báo</Button
      >
    </PageHeader>
    <div class="my-4 flex flex-wrap gap-2">
      <Button
        :variant="!store.unreadOnly ? 'default' : 'outline'"
        :aria-pressed="!store.unreadOnly"
        :disabled="locked"
        @click="select(false)"
        >Tất cả thông báo</Button
      >
      <Button
        :variant="store.unreadOnly ? 'default' : 'outline'"
        :aria-pressed="store.unreadOnly"
        :disabled="locked"
        @click="select(true)"
        >Chưa đọc ({{ store.feed?.unread ?? 0 }})</Button
      >
      <Button
        variant="outline"
        :disabled="locked || !store.feed?.unread"
        @click="store.mutate('read_all', { through: store.feed?.high_water })"
        >Đánh dấu tất cả đã đọc</Button
      >
    </div>
    <details class="mb-4 rounded-xl border bg-card p-4">
      <summary class="cursor-pointer font-medium">Tùy chọn thông báo</summary>
      <p class="my-3 text-sm text-muted-foreground">
        Áp dụng cho sự kiện mới, không xóa thông báo cũ. Không gửi email hay
        thông báo đẩy. Bỏ theo dõi từng task để giảm bình luận không cần thiết.
      </p>
      <div v-if="prefs" class="space-y-3">
        <div
          v-for="(title, key) in preferenceLabels"
          :key="key"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <span class="text-sm">{{ title }}</span
          ><Button
            variant="outline"
            :aria-label="title"
            :aria-pressed="prefs[key]"
            :disabled="locked"
            @click="togglePreference(key)"
            >{{ prefs[key] ? 'Bật' : 'Tắt' }}</Button
          >
        </div>
        <div class="flex flex-wrap gap-2">
          <Button :disabled="locked || !dirty" @click="savePreferences"
            >Lưu tùy chọn</Button
          ><Button
            variant="ghost"
            :disabled="locked || !dirty"
            @click="resetPreferences"
            >Bỏ thay đổi tùy chọn</Button
          >
        </div>
      </div>
    </details>
    <p v-if="store.loading" role="status">Đang tải thông báo…</p>
    <p
      v-if="store.refreshing"
      role="status"
      class="text-sm text-muted-foreground"
    >
      Đang cập nhật…
    </p>
    <p v-if="store.error" role="alert" class="my-3 text-sm text-destructive">
      {{ store.error }}
    </p>
    <p
      v-if="store.writeError"
      role="alert"
      class="my-3 text-sm text-destructive"
    >
      {{ store.writeError }}
    </p>
    <p v-if="store.notice" role="status" class="my-3 text-sm">
      {{ store.notice }}
    </p>
    <template v-if="store.feed">
      <div
        v-if="!store.feed.items.length"
        class="rounded-xl border border-dashed p-8 text-center"
      >
        <h2 class="font-semibold">Không có thông báo phù hợp</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Sự kiện mới sẽ xuất hiện khi bạn được giao việc, nhận lời mời hoặc có
          bình luận trên task đang theo dõi.
        </p>
      </div>
      <ul v-else class="space-y-3">
        <li
          v-for="item in store.feed.items"
          :key="item.id"
          class="min-w-0 rounded-xl border bg-card p-4"
        >
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span>{{ kindLabels[item.kind] }}</span
            ><span class="rounded bg-muted px-2 py-1">{{
              item.read ? 'Đã đọc' : 'Chưa đọc'
            }}</span
            ><time :datetime="item.created_at" class="text-muted-foreground">{{
              new Date(item.created_at).toLocaleString('vi-VN')
            }}</time>
          </div>
          <RouterLink
            v-if="item.task_id && item.board_id"
            :to="{
              path: '/boards/' + item.board_id,
              query: { task: item.task_id },
            }"
            class="mt-2 block break-words font-semibold text-primary hover:underline"
            >{{ item.title }}</RouterLink
          >
          <h2 v-else class="mt-2 break-words font-semibold">
            {{ item.title }}
          </h2>
          <RouterLink
            v-if="item.kind !== 'invitation'"
            :to="'/workspaces/' + item.workspace_id + '/boards'"
            class="mt-1 block break-words text-sm text-muted-foreground hover:underline"
            >{{ item.workspace_name }}</RouterLink
          >
          <p v-else class="mt-1 text-sm">
            Vai trò được mời:
            {{
              item.invitation_role === 'viewer'
                ? 'Viewer — chỉ đọc'
                : 'Member — cộng tác'
            }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              :disabled="locked"
              @click="
                store.mutate('read', {
                  id: item.id,
                  version: item.version,
                  read: !item.read,
                })
              "
              >{{ item.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc' }}</Button
            >
            <Button
              v-if="item.invitation_id"
              :disabled="locked"
              @click="invitation = item"
              >Xem lời mời</Button
            >
          </div>
        </li>
      </ul>
      <nav class="mt-4 flex flex-wrap gap-2" aria-label="Phân trang thông báo">
        <Button
          variant="outline"
          :disabled="locked || store.loading || !cursors.length"
          @click="previous"
          >Thông báo mới hơn</Button
        >
        <Button
          variant="outline"
          :disabled="locked || store.loading || !store.feed.next"
          @click="next"
          >Thông báo cũ hơn</Button
        >
        <Button
          v-if="store.before"
          variant="ghost"
          :disabled="locked"
          @click="select(store.unreadOnly)"
          >Về thông báo mới nhất</Button
        >
      </nav>
    </template>
    <AlertDialog :open="!!invitation" @update:open="setInvitationOpen"
      ><AlertDialogContent
        ><AlertDialogTitle>Tham gia workspace?</AlertDialogTitle
        ><AlertDialogDescription
          >Bạn được mời vào {{ invitation?.workspace_name }} với vai trò
          {{ invitation?.invitation_role }}. Chỉ tài khoản có email đúng lời mời
          mới được tham gia.</AlertDialogDescription
        >
        <p v-if="store.writeError" role="alert">{{ store.writeError }}</p>
        <AlertDialogFooter
          ><AlertDialogCancel :disabled="locked">Hủy</AlertDialogCancel
          ><Button :disabled="locked" @click="accept"
            >Xác nhận tham gia</Button
          ></AlertDialogFooter
        ><Button
          v-if="store.uncertain"
          :disabled="store.pending"
          @click="store.retry"
          >Xác nhận lại thao tác thông báo</Button
        ></AlertDialogContent
      ></AlertDialog
    >
  </main>
</template>
