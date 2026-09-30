# Workspace và thành viên

## Đã triển khai trong source

- `/workspaces`: danh sách workspace được phép truy cập; tạo workspace và trở thành Owner trong cùng transaction.
- `/workspaces/:workspaceId/members`: đổi workspace, đổi tên, xem thành viên. Owner tạo link mời theo email với vai trò Member/Viewer, đổi vai trò, gỡ thành viên, thu hồi lời mời. Không tự gỡ Owner, đổi Owner hoặc cấp thêm Owner.
- `/invite/:token`: đăng nhập đúng email và chấp nhận lời mời. Link dùng một lần, hết hạn sau 7 ngày. Nhận lại cùng link khi vẫn là thành viên là idempotent; bị gỡ thì không dùng lại link đã nhận để tự tham gia.
- Không gửi email. Owner sao chép link rồi tự gửi qua kênh mình chọn. Người nhận phải truy cập được origin trong link; link localhost không dùng từ máy khác. Cần triển khai frontend lên domain dùng chung trước khi mời người khác từ xa.

## Bước bắt buộc trên Supabase thật

Publishable key không có quyền tạo schema. Source đã có migration nhưng không tự áp dụng vào Supabase từ frontend.

1. Mở project Supabase → SQL Editor → New query.
2. Sao chép toàn bộ `supabase/migrations/202609300001_workspaces.sql`, chạy một lần. Migration nằm trong transaction; không sửa bỏ RLS/grants để vượt lỗi. Nếu đã có bảng cùng tên, dừng và kiểm tra thay vì xóa dữ liệu.
3. Kiểm tra ba bảng `workspaces`, `workspace_members`, `workspace_invitations` và RLS đã bật. Trong API settings, public schema cần được expose (mặc định của project).
4. Đăng nhập app, mở `/workspaces`, tạo workspace thử. Nếu UI báo dịch vụ chưa thiết lập, kiểm tra migration đã commit và schema cache đã reload.
5. Dùng tài khoản B với email đã xác minh, nhận link từ A; kiểm tra Member/Viewer không thấy form quản trị. Đổi vai trò, tải lại B; gỡ B rồi thử truy cập lại URL.

Giữ Confirm email bật khi sử dụng lời mời cho người dùng thật. Nếu tắt để phát triển cá nhân, Supabase coi email đăng ký đã xác minh; lúc đó email chỉ là dữ liệu tự khai, không chứng minh quyền sở hữu hộp thư. Không dùng cấu hình đó cho workspace có dữ liệu riêng và người dùng không tin cậy.

## Phân quyền database

RLS chỉ cho thành viên đọc workspace/membership. Client không có quyền ghi trực tiếp bảng. RPC mutation dùng security definer với search_path rỗng, lấy danh tính từ auth.uid và kiểm tra email_confirmed_at từ auth.users. Quyền dựa vào membership trong database, không dựa user_metadata hay role do client gửi.

Owner mutations và accept invite khóa workspace trước, rồi invitation; việc nhận/thu hồi/gỡ thành viên được tuần tự hóa theo workspace. Token 32 byte ngẫu nhiên chỉ trả về một lần; database lưu SHA-256, không expose token hash cho client. Tạo lại lời mời cùng email thu hồi các lời mời đang chờ trước đó. Danh sách lời mời chỉ Owner được đọc.

Tên hiển thị lấy từ auth user metadata khi liệt kê thành viên; chỉ thành viên của workspace được xem email/tên của nhau. Chưa cần bảng profiles riêng cho module này. Owner được bảo vệ bằng đường ghi RPC và unique index một owner/workspace; owner_id là khóa tham chiếu danh tính tạo workspace.

Giao diện tải lại quyền khi focus và mỗi 30 giây trong tab đang hiển thị. Database kiểm tra mỗi request; khi phát hiện mất quyền, cache chi tiết bị xóa. Chưa có subscription realtime cho thu hồi quyền tức thời. Đăng xuất/đổi tài khoản xóa store và loại bỏ kết quả request cũ.

## Ranh giới hiện tại

Workspace/membership dùng database sau khi áp dụng migration. Board `/board` vẫn là board cá nhân local, chưa thuộc workspace; không có board cộng tác, RLS task, comment hay realtime. Do đó chưa coi M1/M2 hoàn thành. Gỡ member hiện không cập nhật assignee task vì chưa có task database liên kết; bước tích hợp board online phải thêm xử lý này cùng transaction.

Chưa có chuyển Owner, xóa workspace, tự rời workspace, email tự động, hoặc migration dữ liệu board local lên cloud. Đổi quyền Member/Viewer hiện áp dụng quản lý workspace; quyền ghi task online cần được thực thi khi có module board online.

## Kiểm chứng

`npm test` chạy cả Vitest logic, component Vue với jsdom và PostgreSQL nhúng PGlite. Test database chạy nguyên migration trên một database bộ nhớ riêng, giả lập auth.users/auth.uid và role của Supabase; không ghi dữ liệu test lên cloud.

Đã kiểm tra: RLS đọc giữa hai workspace; cấm trực tiếp ghi membership; anonymous/unverified bị chặn; Owner được bảo vệ; Member/Viewer không được quản trị; sai email, link hết hạn, thu hồi, cấp lại; nhận lặp không nhân đôi; gỡ thành viên mất quyền và không dùng lại link cũ; token không lưu nguyên văn. PGlite không thay thế kiểm thử cạnh tranh trên nhiều connection hoặc PostgREST/JWT của Supabase thật.

Test store kiểm tra request cũ sau logout, quyền mất khi refresh/write, chặn gửi lặp và thiếu migration. Test component kiểm tra tạo workspace/điều hướng, giữ bản nháp khi lỗi, ẩn form quản trị với Viewer, tạo link Owner.

Auth: chạy lại bộ test; browser gọi Supabase thật bằng thông tin đăng nhập sai và nhận lỗi tiếng Việt; guest vào `/workspaces` được chuyển tới `/login?redirect=/workspaces`. Chưa kiểm chứng đăng nhập thành công, email/reset thực tế hoặc luồng workspace nhiều tài khoản trên cloud vì chưa có phiên kiểm thử và quyền áp dụng migration ở project thật.

Tài liệu tham khảo: https://supabase.com/docs/guides/database/functions và https://supabase.com/docs/guides/database/postgres/row-level-security

## Cập nhật board online (2026-09-30)

Board/task trong workspace đã có migration 002 và đã kiểm tra cloud bằng Owner. Xem [module board](boards.md) để biết setup và phạm vi hiện tại. Board local cũ giữ tại `/personal-board`, không tự import. Các ghi chú ở phần kiểm thử ban đầu phía trên là trạng thái trước khi chạy migration; hiện đã kiểm chứng tạo/đổi tên workspace và tạo/thu hồi lời mời trên cloud. Luồng nhiều tài khoản vẫn chưa nghiệm thu cloud.
