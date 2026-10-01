<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
</script>
<template>
  <main class="mx-auto max-w-3xl p-5 lg:p-9">
    <PageHeader
      title="Hướng dẫn sử dụng"
      description="Từ workspace đầu tiên đến công việc hoàn thành."
    />
    <div class="mt-8 space-y-6 text-sm leading-7">
      <section>
        <h2 class="text-lg font-semibold">1. Tạo workspace và board</h2>
        <p>
          Workspace là không gian của nhóm. Mở Workspace &amp; board, tạo
          workspace rồi tạo board để chia công việc theo dự án.
        </p>
      </section>
      <section>
        <h2 class="text-lg font-semibold">2. Tạo và quản lý công việc</h2>
        <p>
          Chọn Tạo công việc, nhập tên, người phụ trách, ưu tiên và hạn hoàn
          thành. Bấm Lưu công việc để lưu thay đổi. Di chuyển thẻ bằng kéo thả
          hoặc menu trạng thái trên thẻ.
        </p>
      </section>
      <section>
        <h2 class="text-lg font-semibold">3. Làm việc cùng nhóm</h2>
        <p>
          Owner quản lý board và thành viên. Member tạo, sửa công việc và bình
          luận. Viewer chỉ xem. Owner tạo link mời theo email trong trang Thành
          viên rồi tự gửi link cho người nhận.
        </p>
      </section>
      <section>
        <h2 class="text-lg font-semibold">4. Bình luận và lịch sử</h2>
        <p>
          Mở task để trao đổi, xem lịch sử thay đổi hoặc sao chép link trực
          tiếp. Bình luận được gửi riêng với thao tác lưu thông tin task.
        </p>
      </section>
      <section>
        <h2 class="text-lg font-semibold">5. Lưu trữ và đồng bộ</h2>
        <p>
          Workspace, board và task được lưu trên máy chủ, truy cập được sau khi
          đăng nhập trên thiết bị khác. Ứng dụng kiểm tra cập nhật định kỳ; chưa
          có cập nhật realtime. Nếu mất kết nối hoặc có xung đột, đọc thông báo
          và đối chiếu trước khi lưu lại.
        </p>
        <p class="mt-2">
          Lưu trữ giữ lại dữ liệu và cho phép khôi phục. Board cá nhân cũ tại
          /personal-board chỉ lưu trên trình duyệt, không tự chuyển sang
          workspace.
        </p>
      </section>
    </div>
    <RouterLink
      to="/workspaces"
      class="mt-8 inline-block text-primary underline"
      >Mở workspace →</RouterLink
    >
  </main>
</template>
