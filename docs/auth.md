# Module tài khoản — Supabase Auth

## Phạm vi

Đăng ký email/mật khẩu, xác minh và gửi lại email, đăng nhập, phục hồi phiên, đăng xuất trên thiết bị hiện tại, quên/đặt lại mật khẩu, sửa tên hiển thị. UI dùng shadcn-vue. Route guard chờ khởi tạo phiên và chỉ cho tài khoản có email_confirmed_at truy cập /board và /account. Đây là phần Auth của M1; chưa hoàn thành M1.

Tên hiển thị lưu trong auth user_metadata.display_name bằng updateUser, không cần SQL migration cho module này. Metadata chỉ phục vụ hồ sơ, tuyệt đối không dùng làm role/quyền. Chưa có bảng profiles cho tra cứu thành viên, quản trị tài khoản, đổi email, xóa tài khoản, OAuth hoặc MFA. Khi thêm workspace sẽ cần profiles/membership và RLS ở database. Không dùng admin API hay service_role ở frontend.

## Thiết lập

1. Tạo Supabase project, bật Email provider và Confirm email.
2. Copy .env.example thành .env.local; điền VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY bằng project URL và publishable key. Không điền secret/service_role key. Restart npm run dev sau khi sửa env.
3. Auth → URL Configuration: Site URL là http://127.0.0.1:5173. Thêm redirect URL chính xác http://127.0.0.1:5173/auth/callback và http://127.0.0.1:5173/reset-password. Nếu dùng localhost thay vì 127.0.0.1 thì thêm riêng cả hai URL tương ứng. Production dùng origin HTTPS thật và SPA fallback về index.html.
4. Giữ email template sử dụng ConfirmationURL của Supabase. App hiện dùng implicit flow cho SPA; SDK nhận và xóa token fragment, không tự ghi/log token. Không đổi template sang token_hash/PKCE khi chưa cập nhật callback.
5. Cấu hình password policy tối thiểu 8 ký tự ở Supabase đồng bộ với features/auth/config.ts; quy tắc server có thể chặt hơn. Thiết lập SMTP trước khi thử email cho người dùng thật; kiểm tra giới hạn gửi email của môi trường Supabase.

Thiếu hoặc sai env: app hiển thị thông báo, khóa submit auth, vẫn cho truy cập /demo. Không có chế độ đăng nhập giả.

## Cấu trúc và cơ chế

- features/auth/config.ts: route và giới hạn dùng chung.
- features/auth/validation.ts: Zod và lỗi tiếng Việt; không hiển thị thông tin lỗi nội bộ.
- stores/auth.ts: session, pending, error, notice và các API. Subscription callback chỉ cập nhật state đồng bộ để tránh deadlock; đăng ký trước getSession; bỏ kết quả cũ nếu event mới đã đến; unsubscribe khi store bị dispose.
- router/index.ts: guard và phản ứng khi phiên mất hiệu lực; navigation.ts chỉ cho return URL thuộc allowlist /board hoặc /account.
- features/auth/views: login/register/forgot/reset, callback và account.
- lib/supabase.ts: một client, tự refresh session và giới hạn thời gian request.

SDK quản lý session trong browser storage, ứng dụng không tự lưu mật khẩu. Route guard là UX, không thay thế authorization/RLS. Khi mở reset link SDK tạo recovery session rồi updateUser thay mật khẩu. Nếu session/link không hợp lệ, form bị khóa và dẫn tới yêu cầu email mới. Recovery event buộc điều hướng tới form reset trước khi tiếp tục.

## Board trong giai đoạn chuyển tiếp

/demo giữ dữ liệu mẫu legacy ở kanban.board.v1. /board yêu cầu đăng nhập và dùng key kanban.board.v1.<userId>, bắt đầu rỗng. Không tự nhập dữ liệu demo vào tài khoản. Đổi user/đăng xuất xóa state đang hiển thị, unmount đóng dialog/bản nháp. Logout không xóa dữ liệu local đã lưu để tránh mất công việc.

Tách key chỉ tránh nhầm dữ liệu giữa tài khoản ở UI, không phải bảo vệ dữ liệu trên máy dùng chung: localStorage vẫn có thể đọc bằng DevTools. Chưa có database task/RLS hoặc đồng bộ thiết bị. Chỉ sử dụng dữ liệu thử nghiệm cho tới khi hoàn tất persistence online.

## Kiểm thử

npm test kiểm tra validation, return URL, restore session, event logout, race khởi tạo, lỗi mạng, submit lặp, email xác minh không có session, recovery và cách ly board local. Mock SDK xác minh logic ứng dụng; không chứng minh dịch vụ/email hoạt động thật.

Checklist với Supabase thật (chưa thực hiện khi chưa có cấu hình):

- Đăng ký → nhận email → xác minh → /board. Email trùng không làm lộ tình trạng tài khoản qua thông báo thành công.
- Sai mật khẩu/email chưa xác minh hiển thị lỗi; resend bị rate-limit vẫn giữ form.
- Refresh /account giữ phiên; /account khi chưa đăng nhập chuyển login rồi quay lại đúng đích.
- Sửa tên → refresh còn tên; lỗi server không báo thành công.
- Quên mật khẩu → link email → reset → đăng nhập bằng mật khẩu mới; kiểm tra link hết hạn/đã dùng.
- Đăng xuất ở tab A khiến tab B rời route riêng; thử hai tài khoản và đảm bảo không dùng nhầm dữ liệu local.
- Ngắt mạng trong login/save/logout, thử token hết hạn và reconnect.

Tham khảo: https://supabase.com/docs/guides/auth/passwords và https://supabase.com/docs/reference/javascript/auth-onauthstatechange

## Kết quả kiểm chứng 2026-09-29

- Production build và 26 test đạt (SDK mock cho auth; không gọi Supabase thật).
- Browser: /account chuyển tới /login?redirect=/account; đăng ký mobile 390px không tràn ngang; form auth bị khóa khi thiếu env; reset thiếu phiên hiển thị yêu cầu gửi link mới; /demo vẫn có 6 thẻ mẫu đã lưu. Không ghi nhận lỗi console trong lượt kiểm tra này.
- Chưa kiểm chứng email, phiên thật và hồ sơ trên dịch vụ vì dự án chưa có .env.local/Supabase project.
