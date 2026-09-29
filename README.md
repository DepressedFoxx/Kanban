# Kanban · Không gian làm việc cho nhóm nhỏ

Starter Vue 3 chạy local, hướng đến Kanban cộng tác cho freelancer. Bản 0.1 tập trung vào board và cấu trúc code dễ học.

## Yêu cầu dự án và trạng thái

**Đã có board local và module Auth của M1; chưa hoàn thành M1 hoặc MVP cộng tác.**

Đọc **[Yêu cầu dự án (PRD)](docs/requirements.md)** trước khi triển khai tiếp. Tài liệu bao gồm phạm vi MVP, phân quyền, luồng người dùng, quy tắc dữ liệu, tiêu chí nghiệm thu và đối chiếu với code hiện có.

Các mốc thống nhất: M0 local → M1 auth và lưu online có cách ly dữ liệu → M2 nhóm và phân quyền → M3 realtime, xử lý xung đột và nghiệm thu MVP. Các chi tiết chưa trao đổi riêng được ghi là đề xuất làm việc trong PRD.

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

Auth đã có source và cần cấu hình Supabase để kiểm thử thực tế. Chưa có workspace thật, database, lời mời, phân quyền, realtime, đồng bộ nhiều tab, activity log hoặc giải quyết xung đột. “Studio nhỏ” là workspace mẫu; người phụ trách là chuỗi văn bản. Không phải bản SaaS hoàn chỉnh.

Dữ liệu chỉ nằm ở trình duyệt hiện tại (demo: `kanban.board.v1`; tài khoản: `kanban.board.v1.<userId>`). Xóa dữ liệu website sẽ mất board. Khi đang lọc, kéo thả tạm tắt để tránh ghi sai thứ tự; menu chuyển trạng thái vẫn dùng được.

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

Sao chép `.env.example` thành `.env.local`, điền URL và publishable key. Client nằm ở `src/lib/supabase.ts`; board **chưa gọi client này**. Auth sử dụng client này sau khi cấu hình env và redirect URL theo docs/auth.md; task sync chưa triển khai.

Trước khi đưa dữ liệu người dùng lên Supabase: thiết kế migrations, grants/RLS, kiểm thử truy cập giữa workspace, rồi thay lớp lưu local bằng các thao tác database. Không đặt secret/service-role key trong `VITE_*` vì chúng được bundle vào frontend. Xem `docs/architecture.md`.

## Triển khai

Build command: `npm run build`; output: `dist`. Host SPA cần fallback các route về `index.html`. Khi dùng Supabase Auth, cấu hình redirect URL riêng cho local và production. Chưa có deployment được tạo từ starter này.

## Tài khoản

Module Supabase Auth: xem [thiết lập và kiểm thử](docs/auth.md). Cần cấu hình .env.local để đăng nhập thật. /demo hoạt động không cần Supabase; /board và /account yêu cầu phiên đã xác minh email. Board hiện vẫn lưu local theo tài khoản, chưa đồng bộ database.
