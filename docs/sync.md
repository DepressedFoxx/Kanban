# SYNC — Lưu an toàn và đối chiếu dữ liệu

> Cập nhật nghiệm thu 2026-10-01: ba tài khoản thật đã kiểm tra cloud, 125 tests SQL/unit và 10 E2E local đạt. Kết quả mới, benchmark và giới hạn xem [mvp-verification.md](mvp-verification.md). Các kết quả ở lượt triển khai trước bên dưới là lịch sử, không thay thế báo cáo mới.

Module Sync hoàn thiện các yêu cầu SYNC-01–07 trong requirements.md, dùng chung luồng nhận sự kiện của [Collab](collab.md). Không cần migration mới.

## Cách hoạt động

- Board và thảo luận hiển thị trạng thái đang lưu, chưa xác nhận, offline, lỗi, đang kiểm tra và đã đồng bộ. Thời điểm xác nhận chỉ cập nhật khi RPC thành công; kết nối realtime thành công không đồng nghĩa dữ liệu đã được lưu.
- RPC board/task có deadline 15 giây tại `src/features/sync/request.ts`. Request treo được abort; timeout của thao tác ghi vẫn được coi là **chưa rõ kết quả**, vì server có thể đã commit.
- Retry giữ nguyên mutation ID, expected version và bản sao payload ban đầu. RPC hiện có kiểm tra receipt trong transaction trước khi áp dụng lại thao tác. Không tạo ID mới và không tự ghi đè sau conflict.
- Cả lưu mới và retry đều chặn khi trình duyệt báo offline. Không tự gửi bản nháp lúc online trở lại. Collab tải lại snapshot khi reconnect và gom các sự kiện tới trong lúc đang đọc.
- Snapshot vẫn là nguồn dữ liệu chính; kéo thả chờ xác nhận từ server, không rollback toàn board. Board version kiểm soát cả thứ tự task.
- Không cho rời board qua router khi đang lưu/chưa xác nhận; reload/đóng tab có cảnh báo của trình duyệt. Hộp thoại task vẫn giữ cơ chế xác nhận bỏ bản nháp. Logout xóa dữ liệu trong phiên theo luồng auth hiện có.
- Quyền truy cập bị từ chối hoặc token không hợp lệ làm xóa dữ liệu riêng khỏi store. Phản hồi cũ sau cleanup không thể phục hồi dữ liệu đó.

## Giới hạn MVP

Không có hàng đợi offline, không lưu receipt/bản nháp qua reload hoặc đóng trình duyệt. Nếu người dùng bỏ qua cảnh báo reload, cần tải lại dữ liệu máy chủ và kiểm tra kết quả trước khi tạo lại thao tác. Thời gian xác nhận dùng đồng hồ máy người dùng. `navigator.onLine` chỉ là tín hiệu; khi mạng báo online nhưng máy chủ không tới được, deadline/lỗi mạng xử lý phần còn lại.

## Kiểm chứng

Regression test bao gồm timeout/late response, payload thay đổi sau lần gửi đầu, retry khi offline, mất quyền, trạng thái chưa xác nhận, chặn route và cảnh báo reload. Test SQL hiện có kiểm tra receipt, xung đột version, thứ tự và phân quyền. Kiểm thử lỗi mạng tự động dùng mock có kiểm soát; không đồng nghĩa đã giả lập mất mạng trên cloud.

Tham khảo: [Supabase abortSignal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal). Abort transport không được dùng làm bằng chứng rằng transaction chưa commit.
