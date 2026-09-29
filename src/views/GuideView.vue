<template>
  <article class="mx-auto max-w-3xl p-6 lg:p-12">
    <p class="text-xs uppercase tracking-widest text-muted-foreground">
      Hướng dẫn sử dụng
    </p>
    <h1 class="mt-3 text-3xl font-semibold">Bắt đầu với một công việc.</h1>
    <div class="mt-8 space-y-6 text-sm leading-7 text-muted-foreground">
      <section>
        <h2 class="font-semibold text-foreground">01 · Tạo và chỉnh sửa</h2>
        <p>
          Bấm “Tạo công việc”, nhập tên rồi lưu. Bấm tên thẻ để mở chi tiết,
          chỉnh người phụ trách, mức ưu tiên và hạn hoàn thành. Hủy sẽ bỏ thay
          đổi chưa lưu.
        </p>
      </section>
      <section>
        <h2 class="font-semibold text-foreground">02 · Di chuyển</h2>
        <p>
          Kéo thẻ bằng biểu tượng chấm ở góc phải, hoặc dùng menu trạng thái
          trên thẻ. Khi đang tìm kiếm hoặc lọc, hãy dùng menu để giữ thứ tự bảng
          chính.
        </p>
      </section>
      <section>
        <h2 class="font-semibold text-foreground">03 · Dữ liệu của bạn</h2>
        <p>
          Bản khởi đầu lưu dữ liệu trong trình duyệt hiện tại. Xóa dữ liệu
          website sẽ xóa bảng. Tên người phụ trách là văn bản, chưa phải tài
          khoản đã được mời.
        </p>
      </section>
      <section class="rounded-xl border border-border bg-white p-5">
        <h2 class="font-semibold text-foreground">Lộ trình tiếp theo</h2>
        <p>
          Supabase Auth → workspace và phân quyền → lưu board trên database →
          realtime và xử lý xung đột. Các phần này chưa hoạt động trong bản
          local.
        </p>
      </section>
    </div>
    <RouterLink
      to="/board"
      class="mt-8 inline-block font-medium text-primary underline"
      >Quay lại bảng công việc →</RouterLink
    >
  </article>
</template>
