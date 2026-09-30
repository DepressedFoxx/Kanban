# Module board online

Triển khai ngày 2026-09-30. Board và task thuộc workspace, lưu trên Supabase. Đây chưa phải toàn bộ MVP cộng tác.

## Cách dùng

1. Mở Workspace & board, chọn workspace.
2. Owner tạo board; mọi thành viên đọc được board của workspace.
3. Owner/Member tạo hoặc sửa task, chọn người phụ trách từ danh sách thành viên, ưu tiên và hạn hoàn thành.
4. Di chuyển task bằng kéo thả hoặc menu trạng thái. Khi đang lọc, kéo thả bị khóa để không ghi sai thứ tự.
5. Lưu trữ task để bỏ khỏi bảng; mở Công việc lưu trữ để khôi phục. Board lưu trữ chỉ đọc, Owner có thể khôi phục.

Route: `/workspaces/:workspaceId/boards`, `/boards/:boardId`. `/board` chuyển tới danh sách workspace. Board cá nhân cũ ở `/personal-board`, vẫn giữ localStorage theo tài khoản, không tự import lên database.

## Setup

Chạy `supabase/migrations/202609300001_workspaces.sql` trước, sau đó `supabase/migrations/202609300002_boards.sql` trong Supabase SQL Editor. Migration 002 chỉ tạo bảng/RPC mới và trigger bỏ phân công khi gỡ thành viên; không chuyển dữ liệu local hoặc xóa bảng workspace. Không chạy lại migration đã áp dụng.

## Quyền và tính nhất quán

- Owner: tạo, đổi tên, lưu trữ/khôi phục board; mọi thao tác task.
- Member: đọc board, tạo/sửa/di chuyển/lưu trữ/khôi phục task trong board hoạt động.
- Viewer: chỉ đọc. Người ngoài workspace hoặc chưa xác minh email không đọc/ghi được.
- RLS bảo vệ SELECT. Client không có INSERT/UPDATE/DELETE trực tiếp; RPC security definer kiểm tra membership từ auth.uid(), search_path rỗng.
- Assignee phải là thành viên workspace, không nhận tên tùy ý. Khi gỡ thành viên, trigger bỏ assignment và tăng phiên bản board.
- Hạn hoàn thành dùng PostgreSQL date, không chuyển UTC. Client và database đều kiểm tra đầu vào.
- Mọi mutation khóa workspace rồi board, kiểm tra expected version và ghi atomically. Board version bảo vệ cả sửa task lẫn thứ tự kéo thả.
- Kéo thả chỉ gửi task ID, cột đích và vị trí; sự kiện remove ở cột nguồn không tạo request thứ hai. Server tính lại thứ tự cột đích, không nhận snapshot task từ client để ghi đè.
- Mỗi mutation có UUID và receipt gắn actor/board. Retry cùng payload và version không thực thi lần hai. Tái sử dụng UUID với payload khác bị từ chối.
- Nếu mất phản hồi, khóa thao tác mới và cho xác nhận lại đúng request cũ. Không khẳng định đã lưu trước khi máy chủ xác nhận.
- Xung đột: tải snapshot mới, giữ bản nháp form, yêu cầu người dùng đối chiếu và xác nhận phiên bản mới trước khi lưu. Không tự ghi đè.
- Logout/unmount hủy hiệu lực các response cũ và xóa state riêng khỏi UI.

## Cấu trúc

```text
src/features/boards/
  model.ts                # schema, kiểu dữ liệu, giới hạn, route, thông báo lỗi
  api.ts                  # RPC + kiểm tra response
  OnlineTaskDialog.vue    # bản nháp, assignee, conflict, archive
  views/BoardsView.vue     # danh sách/tạo board
  views/OnlineBoardView.vue # Kanban, lọc, kéo thả, archive/restore
  database.test.ts        # chạy migration thật trong PGlite
  store.test.ts           # async, quyền, retry, conflict, redirect
  views.test.ts           # hành vi UI và kéo thả
src/stores/onlineBoard.ts # snapshot, lifecycle request, mutation receipt
supabase/migrations/202609300002_boards.sql
```

Luồng: UI → Pinia → RPC → transaction/PostgreSQL → snapshot có version → UI. Chỉ snapshot đã được máy chủ chấp nhận mới cập nhật state sau thao tác ghi.

## Giới hạn còn lại

Chưa có Supabase Realtime, comment, activity log, import board local, hoặc chỉ báo quá hạn. Hiện tự tải lại mỗi 30 giây khi tab hiển thị, không mở form/đang kéo/đang ghi; focus hoặc kết nối lại cũng tải lại. Không có hàng đợi ghi offline. Receipt chỉ nằm trong state phiên; nếu đóng trang khi mất phản hồi, cần tải lại dữ liệu trước khi nhập lại thao tác.

## Kiểm thử

`npm test`: 69 test local, trong đó 22 test mới cho module board. SQL kiểm tra Owner/Member/Viewer/outsider/unverified/anon, RLS, ghi trực tiếp bị chặn, validation, sai assignee, retry không trùng, stale version, di chuyển, archive/restore và gỡ thành viên. PGlite dùng một connection, chưa chứng minh cạnh tranh nhiều connection thực tế.

Store/UI kiểm tra response cũ sau logout, chặn gửi lặp, retry đúng mutation ID, giữ draft khi conflict, Viewer không có nút ghi, chỉ gửi một request cho kéo thả giữa cột, lỗi migration và redirect an toàn.

Cloud với tài khoản Owner: đã tạo board, tạo task có assignee/ngày, đổi trạng thái, đổi tên, lưu trữ và khôi phục task. Đã kiểm tra thêm kéo thả thật giữa cột, lưu trữ board khóa thao tác ghi, khôi phục board và refresh giữ dữ liệu. Viewport 390px không tràn ngang; desktop 1280px hiển thị đủ 4 cột. Typecheck/build pass; còn cảnh báo chunk chính >500 kB và annotation của Zod. Quyền nhiều tài khoản hiện được kiểm tra local, chưa có tài khoản cloud thứ hai để nghiệm thu.

### Tải lại nền không nhấp nháy

Polling 30 giây/focus/reconnect dùng trạng thái refreshing riêng, không bật loading và không ẩn/khóa nút đang dùng. Snapshot không đổi giữ nguyên object; response poll cũ không được ghi đè mutation mới. Lỗi mạng tạm giữ bản đã tải kèm thông báo đồng bộ; lỗi mất quyền vẫn xóa dữ liệu riêng. Tải lần đầu và nút Tải lại vẫn có loading.
