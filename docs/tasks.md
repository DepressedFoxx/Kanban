# Module task chi tiết

Cập nhật 2026-10-05: G4 bổ sung theo dõi/thông báo; G5 bổ sung file đính kèm private trong dialog task, retry, download và xoá theo quyền. Xem [G4](g4-verification.md) và [G5](g5-verification.md) cho giới hạn và bằng chứng hiện tại.

Cập nhật 2026-10-03: task online đã có nhãn, checklist, duplicate/bulk và sửa/xóa comment. Xem [cách dùng và nghiệm thu G2](g2-verification.md). Các số liệu ngày 2026-09-30 bên dưới là bằng chứng lịch sử.

## Phạm vi

Task CRUD, phân công, kéo thả và archive/restore dùng module board hiện có. Module này thêm:

- URL `/boards/:boardId?task=:taskId`, mở trực tiếp task và giữ đích sau đăng nhập. G3 cho phép thêm `returnTo` trỏ về `/my-tasks` với bộ lọc/phân trang đã xác thực; không cho redirect tùy ý hoặc ra ngoài ứng dụng.
- Link task có thể sao chép; mở được cả task lưu trữ ở chế độ chỉ đọc, với nút khôi phục cho người có quyền.
- Bình luận văn bản thuần tối đa 2.000 ký tự sau trim, lưu tác giả và thời gian từ server. Owner/Member được thêm; Viewer chỉ đọc. Task hoặc board lưu trữ không nhận bình luận mới.
- Lịch sử tạo/sửa task, đổi trạng thái, assignee, ngày, ưu tiên, thứ tự, archive/restore; hiển thị giá trị trước/sau và người thực hiện.
- Nhãn Quá hạn khi hạn trước ngày hiện tại theo timezone workspace và chưa hoàn thành, đồng thời task/board/workspace không archived. Không chuyển hạn sang UTC; cập nhật ngày trong phiên đang mở.

## Migration

Sau migrations 001 và 002, chạy `supabase/migrations/202609300003_task_details.sql` trong SQL Editor. Migration bổ sung `task_comments`, `task_activity`, RPC và trigger. Không tạo giả lịch sử cho task có sẵn; chỉ ghi thay đổi từ thời điểm migration được áp dụng. Không xóa dữ liệu hiện tại.

G1 và G2 đã áp dụng trên project cloud hiện tại. Môi trường mới cần chạy toàn bộ migrations theo thứ tự tên file, gồm `20261002023448_workspace_settings_lifecycle.sql` và `20261002063835_task_productivity_g2.sql`.

## Tính nhất quán và quyền

Trigger audit chạy cùng transaction với thao tác task, kể cả khi gỡ thành viên làm bỏ assignment. No-op không ghi activity; mutation thất bại rollback cả lịch sử. Retry board mutation không thực thi lại trigger.

Client chỉ có SELECT qua RLS; không được INSERT/UPDATE/DELETE trực tiếp comment/activity. RPC kiểm tra board-task đúng quan hệ, workspace membership và trạng thái archive. Tác giả lấy từ auth.uid(), tên được chụp tại thời điểm ghi; tên hiển thị không dùng để quyết định quyền.

Comment sử dụng UUID từ client như mã chống gửi trùng. Retry cùng UUID, task, actor và body không tạo bản ghi thứ hai; dùng lại UUID với nội dung khác bị từ chối. Không tăng board version chỉ vì có bình luận mới, tránh gây conflict không cần thiết cho bản nháp task.

Store giữ bản nháp khi lỗi, khóa gửi mới khi kết quả chưa chắc chắn và retry đúng request cũ. Đổi task/unmount/logout vô hiệu hóa response đang bay; mất quyền xóa dữ liệu thảo luận. UI render nội dung như text, không dùng v-html.

Mỗi trang lấy tối đa 50 bình luận/activity mới nhất. Nút tải cũ hơn dùng cursor ổn định: `(created_at,id)` cho comment, ID sequence cho activity. Có realtime kèm tải nền dự phòng 30 giây khi tab hiển thị, giữ nguyên form và không bật loading khi polling. Refresh mới nhất đưa danh sách comment về trang đầu để tránh giữ nội dung đã sửa/xóa ở các trang cũ; có thể tải lại trang cũ bằng cursor.

## Source

- `src/features/tasks/model.ts`: schema, giới hạn, link và quy tắc quá hạn.
- `src/features/tasks/api.ts`: RPC thread/comment.
- `src/features/tasks/TaskThread.vue`: bình luận, lịch sử, phân trang.
- `src/stores/taskThread.ts`: dữ liệu thảo luận, lifecycle request và retry.
- `src/features/boards/OnlineTaskDialog.vue`: bản nháp task, share link và thảo luận.

## Kiểm thử và giới hạn

SQL local kiểm tra tác giả server, RLS, Viewer/outsider/unverified, task sai board, archive, validation, retry, no-op, rollback và phân trang có timestamp trùng. Store/UI kiểm tra response cũ, lỗi mạng giữ draft, retry đúng ID, XSS dưới dạng text, link an toàn và ngày địa phương.

Đã có edit/delete comment và realtime INSERT/UPDATE. Chưa có mention và đính kèm. Xóa comment đặt body = NULL và giữ dấu đã xóa; Owner xóa comment người khác phải ghi lý do. Bình luận thành công được giữ trên server dù đóng trang; nếu đóng trang lúc chưa nhận phản hồi thì cần tải lại để kiểm tra trước khi nhập lại. Snapshot tên tác giả lịch sử không tự thay đổi theo hồ sơ mới.

### Kết quả xác minh 2026-09-30

- 95 tests / 11 files passed; production build và TypeScript passed.
- Migration 003 đã được người dùng áp dụng trên Supabase cloud.
- Browser cloud: tạo task QA, nhãn quá hạn, mở permalink sau reload, cập nhật mô tả và lịch sử ghi đúng tác giả/giá trị trước-sau; tải danh sách bình luận thành công.
- Đã quan sát giao diện ở viewport mobile 390px. Chưa gửi bình luận thử trên cloud; ghi bình luận, retry và phân quyền được kiểm thử bằng SQL local/store/UI.
- Build còn cảnh báo chunk lớn hơn 500 kB và annotation từ Zod; không làm build thất bại.

Cập nhật 2026-10-01: collab Postgres Changes đã triển khai cho board/task và thảo luận; xem [tài liệu collab](collab.md). Các ghi chú cũ về chưa có realtime được thay thế bởi phạm vi trong tài liệu này.
