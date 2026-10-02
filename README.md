# Kanban · Không gian làm việc cho nhóm nhỏ

Starter Vue 3 chạy local, hướng đến Kanban cộng tác cho freelancer. Bản 0.1 tập trung vào board và cấu trúc code dễ học.

## Yêu cầu dự án và trạng thái

**Đã có Auth, Workspace, Board/Task online, Collab và Sync; kiểm thử cloud nhiều tài khoản đã thực hiện. Còn nghiệm thu email và accessibility thủ công trước khi chốt toàn bộ MVP.**

Đọc **[Yêu cầu dự án (PRD)](docs/requirements.md)** trước khi triển khai tiếp. Tài liệu bao gồm phạm vi MVP, phân quyền, luồng người dùng, quy tắc dữ liệu, tiêu chí nghiệm thu và đối chiếu với code hiện có.

Các mốc thống nhất: M0 local → M1 auth và lưu online có cách ly dữ liệu → M2 nhóm và phân quyền → M3 realtime, xử lý xung đột và nghiệm thu MVP. Các chi tiết chưa trao đổi riêng được ghi là đề xuất làm việc trong PRD.

G1 đã bổ sung Workspace Settings, chuyển Owner, rời nhóm, archive/restore và timezone. Mở **Cài đặt workspace** từ trang board/thành viên. Xem [hướng dẫn và nghiệm thu G1](docs/g1-verification.md) để biết phạm vi đã kiểm thử và phần còn mở.

## Chạy dự án

Node.js 24 LTS, npm. Trong PowerShell:

```powershell
cd C:\Users\Vitech\Documents\personal\Kanban
npm.cmd install
npm.cmd run dev
```

Mở URL Vite in ra, mặc định http://127.0.0.1:5173. Từ lần sau chỉ cần `npm.cmd run dev`.

## Đã hoạt động

- Board 4 cột, dữ liệu mẫu; tạo, sửa, xóa qua AlertDialog xác nhận.
- Kéo thả bằng tay nắm, sắp xếp và di chuyển giữa cột.
- Menu đổi trạng thái dùng được bằng bàn phím và trên mobile.
- Tìm kiếm tiêu đề/mô tả/người phụ trách, lọc ưu tiên.
- LocalStorage lưu task và thứ tự qua tải lại trang; thông báo lỗi đọc/ghi.
- Form dialog dùng Reka UI, focus trap và Escape; layout responsive.
- Pinia, Vue Router, Tailwind 4, font Be Vietnam Pro được bundle local.
- UI dùng shadcn-vue: Button, Input, Textarea, Label, Select, Dialog và AlertDialog.
- [Cấu hình dùng chung và quy ước bảo trì](docs/configuration.md).
- Typecheck, kiểm thử store/storage, Prettier và CI.

## Giới hạn hiện tại

Ứng dụng có workspace thật, lời mời link, Owner/Member/Viewer, task/comment/activity và realtime trên Supabase. Board cá nhân local là luồng riêng, không tự import online.

Dữ liệu chỉ nằm ở trình duyệt hiện tại (tài khoản: `kanban.board.v1.<userId>`). Xóa dữ liệu website sẽ mất board. Khi đang lọc, kéo thả tạm tắt để tránh ghi sai thứ tự; menu chuyển trạng thái vẫn dùng được.

## Cấu trúc

```text
src/
  assets/main.css          Theme, Tailwind, font, responsive
  components/board/        Cột, thẻ và form dialog
  components/ui/           Các component shadcn-vue
  features/board/model.ts  Type, validation Zod, dữ liệu mẫu
  features/board/storage.ts Đọc/ghi localStorage
  stores/board.ts          Nơi cập nhật state và lưu thay đổi
  features/auth/           Cấu hình, validation, màn hình tài khoản
  stores/auth.ts           Phiên và action Supabase Auth
  lib/supabase.ts          Client Supabase dùng cho auth
  router/index.ts          Routes và auth guards
  views/                  Trang ghép các component
```

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run format:check
```

`npm.cmd run format` tự format source. Đọc [luồng hoạt động và bài tập](docs/learning-guide.md), [kiến trúc và lộ trình](docs/architecture.md), [checklist thủ công](docs/manual-checks.md).

## Kết nối Supabase

Sao chép `.env.example` thành `.env.local`, điền URL/publishable key và cấu hình Auth redirect theo docs/auth.md. Auth và board online sử dụng `src/lib/supabase.ts`; áp dụng migrations theo thứ tự trước khi sử dụng.

Trước khi đưa dữ liệu người dùng lên Supabase: thiết kế migrations, grants/RLS, kiểm thử truy cập giữa workspace, rồi thay lớp lưu local bằng các thao tác database. Không đặt secret/service-role key trong `VITE_*` vì chúng được bundle vào frontend. Xem `docs/architecture.md`.

## Triển khai

Build command: `npm run build`; output: `dist`. Host SPA cần fallback các route về `index.html`. Khi dùng Supabase Auth, cấu hình redirect URL riêng cho local và production. Chưa có deployment được tạo từ starter này.

## Workspace và thành viên

Đã có source cho danh sách/tạo workspace, quản lý Owner/Member/Viewer và lời mời bằng link. Cần chạy [migration](supabase/migrations/202609300001_workspaces.sql) trên Supabase trước khi dùng. Xem [thiết lập, phân quyền và kiểm chứng](docs/workspaces.md). Board online đã gắn với workspace; board cá nhân local là luồng riêng.

## Thiết lập tài khoản

Module Supabase Auth: xem [thiết lập và kiểm thử](docs/auth.md). Cần cấu hình .env.local để đăng nhập thật. /board và /account yêu cầu phiên đã xác minh email. Board online lưu trên Supabase theo quyền workspace.

## Board online trong workspace

Module board/task đã lưu trên Supabase với phân quyền, lưu trữ/khôi phục, kiểm soát phiên bản và retry an toàn. Xem [setup, kiến trúc và kiểm thử board](docs/boards.md). Mở Workspace & board để bắt đầu. Board cá nhân local được giữ tại `/personal-board`; `/board` chuyển về danh sách workspace. Đã có realtime/comment/activity.

## Task chi tiết

Xem [module task](docs/tasks.md) cho deep link, bình luận, lịch sử thay đổi và quá hạn. Cần migration `202609300003_task_details.sql` sau hai migration workspace/board. Bình luận/activity và realtime đã triển khai.

Cập nhật 2026-10-01: collab Postgres Changes đã triển khai cho board/task và thảo luận; xem [tài liệu collab](docs/collab.md). Các ghi chú cũ về chưa có realtime được thay thế bởi phạm vi trong tài liệu này.

Tổng kết phạm vi, bằng chứng và checklist nghiệm thu M3: [docs/mvp-summary.md](docs/mvp-summary.md).

## Kiểm thử MVP local và Supabase

Xem [báo cáo nghiệm thu, cấu hình tài khoản thử và lệnh E2E](docs/mvp-verification.md).

## Kế hoạch phát triển v1

Xem [kế hoạch sản phẩm v1](docs/product-v1-roadmap.md) cho phạm vi, thứ tự triển khai, quy tắc nghiệp vụ và checklist nghiệm thu từng giai đoạn.

G0 đã hoàn thành: [đặc tả v1 và hợp đồng triển khai G1](docs/product-v1-spec.md).
