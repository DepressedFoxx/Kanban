# Collab — cập nhật trực tiếp

> Cập nhật nghiệm thu 2026-10-01: ba tài khoản thật đã kiểm tra cloud, 125 tests SQL/unit và 10 E2E local đạt. Kết quả mới, benchmark và giới hạn xem [mvp-verification.md](mvp-verification.md). Các kết quả ở lượt triển khai trước bên dưới là lịch sử, không thay thế báo cáo mới.

## Phạm vi

Board đang mở nhận thay đổi task, trạng thái, thứ tự, tên board và archive qua Postgres Changes. Task dialog nhận bình luận và lịch sử mới. Không tự merge nội dung người dùng đang sửa; bản nháp được giữ và phải đối chiếu khi version thay đổi.

Chưa có Presence, con trỏ cộng tác, typing indicator, thông báo/mention hoặc chỉnh văn bản đồng thời kiểu Google Docs. Danh sách workspace/board chưa có subscription riêng.

## Thiết lập

Migration `20261001013707_collab_realtime.sql` đã áp dụng lên project cloud ngày 2026-10-01 qua Supabase connector. Migration chỉ thêm `boards`, `workspace_members`, `task_comments`, `task_activity` vào publication `supabase_realtime`; không mở rộng SELECT, EXECUTE hoặc bỏ RLS. Có thể chạy lại an toàn.

Không subscribe DELETE: Supabase có giới hạn lọc/ủy quyền cho sự kiện xóa. Task sử dụng archive. Thu hồi membership được phát hiện qua RPC tiếp theo, hoặc kiểm tra định kỳ tối đa khoảng 30 giây khi tab đang hiển thị, có mạng và không đang giữ thao tác chưa xác nhận. Quyền ghi luôn được kiểm tra tại server ngay khi thao tác.

## Luồng dữ liệu

1. Ghi dữ liệu qua các RPC hiện có, với version và mutation receipt.
2. Sự kiện từ publication chỉ đánh dấu dữ liệu cần cập nhật; không lấy payload làm dữ liệu tin cậy để patch UI.
3. Gom sự kiện trong 180ms, tải snapshot/thread qua RPC được kiểm tra quyền.
4. Nếu đang kéo thả, đang ghi hoặc chưa xác nhận kết quả ghi, giữ yêu cầu tải lại và thử sau; sự kiện đến trong lúc đang tải sẽ tạo một lượt tải tiếp theo.
5. Sau subscribe/reconnect, focus, online hoặc quay lại tab, tải snapshot mới. Polling 30 giây vẫn hoạt động để bù sự kiện bị lỡ và kiểm tra quyền.
6. Rời trang/logout hủy channel và timer; response cũ bị các store chặn bằng generation.

UI phân biệt đang kết nối, cập nhật trực tiếp, fallback định kỳ và offline. SUBSCRIBED biểu thị kênh đã kết nối; lỗi RPC vẫn có thông báo đồng bộ riêng.

## Xác minh

- Unit tests: burst events, reconnect, event trong khi tải, request đang bị chặn, hidden/offline, timer/channel teardown.
- SQL local: publication lặp lại an toàn, chỉ gồm 4 bảng có RLS; các kiểm thử phân quyền board/task tiếp tục đạt.
- Regression: snapshot mới không đóng hoặc reset form tạo task mới; form sửa giữ bản nháp và hiển thị so sánh.
- Cloud: 4 bảng trong publication vẫn bật RLS. Hai tab cùng tài khoản nhận thay đổi task, hiển thị xung đột mà giữ bản nháp, và nhận activity mới. Đã khôi phục tên task QA sau kiểm thử; lịch sử kiểm thử được giữ.
- Bổ sung ngày 2026-10-01: đã kiểm tra ba tài khoản độc lập, comment RPC, năm phiên realtime, reconnect và subscription sau gỡ quyền. Chi tiết trong báo cáo nghiệm thu mới.

## Security advisor

Các lưu ý có từ trước: receipt/invitation tables bật RLS không có policy (cố ý chỉ truy cập qua RPC); các RPC SECURITY DEFINER có quyền authenticated (kiểm tra membership trong hàm); leaked-password protection chưa bật. Migration này không thay đổi các thiết lập đó.

- [RLS không có policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [SECURITY DEFINER callable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
