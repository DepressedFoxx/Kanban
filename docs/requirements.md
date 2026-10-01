# Yêu cầu dự án Kanban

Ngày lập: 2026-09-29. Phiên bản tài liệu: 0.1.

**Cập nhật 2026-09-30: Auth, workspace/thành viên và board/task online đã có source và migration. Đã kiểm tra cloud bằng tài khoản Owner; chưa nghiệm thu nhiều tài khoản hoặc MVP cộng tác. Xem boards.md.**

Tài liệu này cụ thể hóa ý tưởng đã trao đổi thành phạm vi phát triển và tiêu chí nghiệm thu. Các quyết định chi tiết như quyền xóa, thời hạn lời mời và giới hạn MVP bên dưới là đề xuất làm việc ban đầu, có thể điều chỉnh; không phải tính năng đã triển khai hoặc quyết định đã được người dùng duyệt riêng.

## 1. Mục tiêu và người dùng

Xây dựng ứng dụng Kanban cho nhóm freelancer nhỏ, giúp quản lý dự án, phân công công việc và theo dõi tiến độ cùng nhau. Mục tiêu học tập là hiểu Vue qua ứng dụng thật: state/props/emits, computed/watch, lifecycle, composables, router, store, validation và bất đồng bộ.

Người dùng mục tiêu: nhóm 2–10 người; khách hàng có thể tham gia với quyền chỉ xem. Đây là đối tượng thiết kế, chưa phải giới hạn số thành viên được cưỡng chế trong sản phẩm.

Luồng giá trị chính: đăng nhập → tạo workspace → mời thành viên → tạo board → tạo/giao task → di chuyển task → thành viên khác thấy cập nhật → xem lịch sử thay đổi.

## 2. Định nghĩa các mốc

| Mốc                     | Ý nghĩa                                                                | Trạng thái                 |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------- |
| M0 — Starter local      | UI và logic board, dữ liệu trong một trình duyệt                       | Đã có; xem verification.md |
| M1 — Online cá nhân     | Auth, workspace/board, lưu database với cách ly dữ liệu                | Chưa triển khai            |
| M2 — Nhóm có phân quyền | Membership, lời mời, quyền Owner/Member/Viewer, comment                | Chưa triển khai            |
| M3 — MVP cộng tác       | M1 + M2 + realtime, xử lý xung đột, activity, deployment và nghiệm thu | Chưa triển khai            |
| Sau MVP                 | Nâng cấp sản phẩm theo phản hồi thực tế                                | Chưa lập lịch              |

MVP trong tài liệu này là **M3**, không đồng nghĩa với bản UI chạy được. “Bản hoàn chỉnh” cần được đánh giá theo phạm vi release cụ thể; chưa tuyên bố production-ready chỉ vì build/test frontend đạt.

## 3. Phạm vi MVP

### AUTH — Xác thực

- AUTH-01: đăng ký/đăng nhập bằng email và mật khẩu qua Supabase Auth; xác minh email trước khi sử dụng workspace.
- AUTH-02: đăng xuất, phục hồi phiên và đặt lại mật khẩu qua email.
- AUTH-03: bảo vệ route; khi hết phiên, điều hướng tới đăng nhập và cho quay lại đích hợp lệ sau đăng nhập. Không lưu mật khẩu trong ứng dụng.
- Nghiệm thu: tài khoản mới hoàn thành được luồng xác minh; refresh giữ phiên hợp lệ; sau logout không đọc được dữ liệu riêng. Hiển thị lỗi xác thực và trạng thái đang gửi, chặn submit lặp.

### WS — Workspace và thành viên

- WS-01: người dùng tạo workspace và trở thành Owner; xem/chuyển giữa các workspace mình tham gia.
- WS-02: Owner mời theo email với vai trò Member hoặc Viewer. Link một lần, hết hạn sau 7 ngày (đề xuất), có thể thu hồi.
- WS-03: chỉ người đăng nhập có email đã xác minh khớp lời mời được nhận; nhận lặp không tạo membership trùng.
- WS-04: Owner đổi vai trò hoặc gỡ Member/Viewer. MVP có một Owner; chưa hỗ trợ chuyển Owner, Owner rời nhóm hoặc xóa workspace để tránh luồng mất quyền sở hữu chưa hoàn thiện.
- Nghiệm thu: người ngoài nhóm không truy cập được dữ liệu bằng URL, request trực tiếp hay subscription. Người bị gỡ mất quyền với thao tác tiếp theo; UI đóng dữ liệu riêng khi nhận biết mất quyền, không tự tiếp tục ghi.

### BOARD — Board và cột

- BOARD-01: Owner tạo/đổi tên/lưu trữ board; mọi thành viên xem danh sách board được phép trong workspace.
- BOARD-02: MVP dùng 4 cột cố định: Cần làm, Đang làm, Chờ kiểm tra, Hoàn thành. Chưa tùy biến cột, chưa di chuyển task giữa board.
- BOARD-03: board lưu trữ chỉ đọc; Owner có thể khôi phục. Không xóa vĩnh viễn board trong MVP.
- Nghiệm thu: reload và truy cập bằng tài khoản thành viên khác cho cùng dữ liệu; không truy cập được board khác workspace bằng cách thay ID.

### TASK — Công việc

- TASK-01: tạo/sửa task gồm tiêu đề 1–120 ký tự sau trim, mô tả tối đa 2.000 ký tự, ưu tiên thấp/vừa/cao, một người phụ trách tùy chọn, một hạn hoàn thành tùy chọn.
- TASK-02: assignee phải là thành viên hiện tại của workspace; tên gõ tự do hiện chỉ tồn tại ở board cá nhân local. Gỡ thành viên thì bỏ gán các task đang giao cho người đó, giữ lịch sử.
- TASK-03: form dùng bản nháp. Hủy không ghi; lỗi server giữ dữ liệu nhập và cho thử lại. Client và server/database đều kiểm tra đầu vào.
- TASK-04: kéo trong cột và giữa cột; có thao tác menu cho bàn phím/mobile. Khi đang lọc, tắt kéo thả và giải thích; menu chuyển trạng thái vẫn hoạt động.
- TASK-05: thứ tự và cột được lưu nguyên tử. Không mất/nhân đôi task; thao tác trên danh sách lọc không được ghi đè toàn cột bằng tập con.
- TASK-06: tìm theo tiêu đề/mô tả/người phụ trách, lọc ưu tiên và assignee. Tìm kiếm không phân biệt hoa thường; chưa yêu cầu bỏ dấu tiếng Việt.
- TASK-07: lưu trữ/khôi phục task thay cho xóa vĩnh viễn trong MVP online. Bản local hiện có xóa xác nhận hai lần, chưa có khôi phục.
- TASK-08: hạn hoàn thành là ngày theo lịch, không tự chuyển thành mốc UTC làm lệch ngày. Quá hạn khi ngày hiện tại vượt hạn và task chưa hoàn thành.
- Nghiệm thu: test tiêu đề toàn khoảng trắng; Hủy; lỗi lưu; chuyển cột; reorder; reload; assignee sai workspace; task bị người khác lưu trữ khi đang mở form.

### COLLAB — Trao đổi và lịch sử

- COLLAB-01: Owner/Member thêm comment văn bản thuần tối đa 2.000 ký tự; Viewer chỉ đọc. MVP chưa có sửa/xóa comment, mention hay upload.
- COLLAB-02: activity ghi ai, lúc nào, hành động và thay đổi khi tạo/sửa task, đổi cột, đổi assignee, lưu trữ/khôi phục task. Comment có tác giả/thời điểm riêng.
- COLLAB-03: activity do database/server tạo cùng transaction với thay đổi, client không tự nhận là người khác hoặc sửa/xóa log.
- Nghiệm thu: hai tài khoản thấy đúng tác giả; thay đổi thất bại không sinh activity thành công; retry không tạo trùng comment/task/activity.

### SYNC — Đồng bộ và xung đột

- SYNC-01: tài khoản đang mở cùng board nhận thay đổi task/comment/activity; cập nhật theo ID và phiên bản, không thêm trùng event do chính mình gửi.
- SYNC-02: UI có trạng thái đang lưu/đã lưu/lỗi/mất kết nối. Có thể optimistic update khi di chuyển, nhưng không báo đã lưu trước khi server xác nhận.
- SYNC-03: gửi expectedVersion và mutationId. Server kiểm tra và ghi nguyên tử; cập nhật từ bản cũ bị từ chối có thông báo, giữ bản nháp để đối chiếu, không tự ghi đè.
- SYNC-04: thay đổi thứ tự cần kiểm soát xung đột ở mức board hoặc nhóm thứ tự, không chỉ version của một task. Hai người kéo hai task vào cùng vị trí cũng phải có kết quả thứ tự xác định.
- SYNC-05: lỗi optimistic update phải đối chiếu server; không rollback toàn board đè thay đổi mới hơn của người khác. Mất phản hồi phải kiểm tra mutationId trước retry.
- SYNC-06: reconnect thì tải lại snapshot; đồng bộ snapshot/subscription phải xử lý sự kiện đến trong khoảng tải dữ liệu. Đổi board, logout hoặc unmount thì cleanup subscription cũ.
- SYNC-07: khi biết đang offline, chặn ghi và cho biết lý do; MVP chưa có hàng đợi ghi offline. Giữ bản nháp trong phiên khi có thể.
- Nghiệm thu: hai phiên người dùng, sự kiện trùng, reconnect, xung đột cùng task, cùng vị trí, quyền vừa bị thu hồi, timeout sau khi server đã ghi. Realtime là vận chuyển sự kiện, không thay thế những quy tắc này.

## 4. Ma trận quyền đề xuất

Các quyền áp dụng trong workspace mà người dùng còn membership. Route guard và UI chỉ giúp trải nghiệm; backend/RLS phải thực thi cùng quy tắc.

| Hành động                                  | Owner | Member | Viewer |
| ------------------------------------------ | ----- | ------ | ------ |
| Đọc board/task/comment/activity            | Có    | Có     | Có     |
| Tạo/sửa/di chuyển task trong board đang mở | Có    | Có     | Không  |
| Lưu trữ/khôi phục task                     | Có    | Có     | Không  |
| Thêm comment                               | Có    | Có     | Không  |
| Tạo/đổi tên/lưu trữ/khôi phục board        | Có    | Không  | Không  |
| Mời/gỡ người, sửa vai trò Member/Viewer    | Có    | Không  | Không  |
| Đổi tên workspace                          | Có    | Không  | Không  |
| Sửa/xóa activity log                       | Không | Không  | Không  |

Mỗi tài khoản được tự tạo workspace mới; Owner trong workspace A không mặc nhiên có quyền ở workspace B. Chưa có board riêng tư trong workspace ở MVP.

## 5. Màn hình và trạng thái cần thiết

| Màn hình                  | Nội dung                                | Trạng thái phải có                                         |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| Auth                      | Đăng ký, đăng nhập, quên/reset mật khẩu | Đang gửi, lỗi, chờ xác minh, hết hạn link                  |
| Workspace list/onboarding | Tạo hoặc chọn workspace                 | Chưa có workspace, đang tải, lỗi                           |
| Board list                | Board đang mở/lưu trữ                   | Chưa có board, mất quyền, lỗi tải                          |
| Kanban board              | Cột, task, lọc, tiến độ                 | Đang tải, empty, không có kết quả, lỗi, mất kết nối        |
| Task detail               | Bản nháp, comment, activity             | Đang lưu, lỗi validation/server, conflict, task bị lưu trữ |
| Members                   | Thành viên, vai trò, lời mời            | Lời mời pending/hết hạn/đã nhận/thu hồi                    |
| Accept invite             | Kiểm tra lời mời và tài khoản           | Sai email, link hết hạn/thu hồi, đã tham gia               |

Đích route đề xuất: /login, /register, /reset-password, /workspaces, /workspaces/:workspaceId/boards, /boards/:boardId, /workspaces/:workspaceId/members, /invite/:token. Task đang mở có thể dùng query taskId để chia sẻ link. Route local /board và /guide hiện tại chưa đại diện cho các route online này.

## 6. Dữ liệu và quy tắc nhất quán

- profiles: auth user ID, tên hiển thị.
- workspaces, workspace_members: một membership duy nhất cho mỗi user/workspace; role do luồng có quyền quản lý.
- invitations: workspace, email chuẩn hóa, role, token được bảo vệ, hạn dùng, trạng thái.
- boards, columns: cột thuộc board; board thuộc workspace; thứ tự cột cố định ở MVP.
- tasks: board/cột, title, description, assignee user ID, priority, due_date, position, version, archived_at, timestamps.
- comments, activity_events: liên kết task/board, actor và thời điểm do server xác nhận.
- mutation receipts hoặc cơ chế tương đương: chống thực thi trùng cùng mutationId.

Mọi liên kết task → cột → board → workspace phải nhất quán bằng constraint/transaction và authorization, không chỉ kiểm tra frontend. Workspace và board/task đã có migration, RLS và RPC. Comment và activity đã có migration 003; realtime vẫn là mô hình mục tiêu.

## 7. Yêu cầu chất lượng

- Desktop và mobile từ 390px: không tràn ngang toàn trang; thao tác task qua menu khi không kéo được.
- Form có label, focus nhìn thấy, dialog dùng bàn phím/Escape; hành động bị chặn có giải thích. Màu không là dấu hiệu duy nhất của ưu tiên/trạng thái.
- Không hiển thị thành công giả khi API lỗi. Giữ input khi có lỗi; loading và empty state phân biệt rõ.
- RLS/grants được test allow/deny với ít nhất hai workspace; không có service-role secret trong bundle. Comment render dưới dạng text, không tin HTML do người dùng nhập.
- Mục tiêu thử nghiệm: 100 task/board, 5 phiên đồng thời; event online xuất hiện ở phiên khác trong 2 giây ở môi trường đo đã ghi rõ. Đây là mục tiêu nghiệm thu, chưa phải kết quả benchmark hoặc SLA.
- Migration có trong Git; có seed/test data tách dữ liệu thật. Không tự tải dữ liệu local lên tài khoản online khi chưa có lựa chọn import rõ ràng.
- CI kiểm tra formatting, typecheck, unit/integration phù hợp và production build. Có E2E cho luồng chính và kiểm thử authorization độc lập UI.

## 8. Phạm vi sau MVP

Billing/subscription, thanh toán, AI, biểu đồ nâng cao, calendar, automation rules, file upload, nhắc hạn/email notification ngoài auth/invite, nhiều người phụ trách/task, board riêng tư, tùy biến cột, offline-first, ứng dụng mobile native, chuyển Owner/xóa workspace.

Không cần thêm các mục này để gọi M3 là MVP. Production có người dùng thật cần quyết định thêm backup/restore, vận hành, giám sát, chi phí, chính sách dữ liệu và hỗ trợ người dùng theo mô hình triển khai thực tế.

## 9. Hiện trạng so với yêu cầu

- Auth/workspace: có Supabase Auth, tạo workspace, membership và lời mời. Cloud đã kiểm tra với Owner; chưa hoàn thành luồng nhiều tài khoản.
- Board/task: nhiều board online, task CRUD qua RPC, assignee membership, tìm/lọc, drag-and-drop, archive/restore, kiểm soát phiên bản và retry. Xem [module board](boards.md).
- Board cá nhân cũ: localStorage tại `/personal-board`, giữ nguyên dữ liệu cũ; không tự import online.
- Cộng tác: đã có bình luận và lịch sử task qua migration 003; xem [module task](tasks.md). Hiện tải lại định kỳ, chưa có realtime và chưa đạt M3.
- Kiểm thử: 69 test local, gồm SQL/RLS và UI/store; cloud Owner đã kiểm tra các thao tác board/task chính. Không đồng nghĩa nghiệm thu concurrent writes nhiều connection hoặc nhiều tài khoản.

## 10. Kịch bản nghiệm thu MVP

1. A đăng ký/xác minh/đăng nhập, tạo workspace và board.
2. A mời B làm Member và C làm Viewer; sai email/hết hạn bị từ chối.
3. B tạo task, gán A, sửa mô tả, thêm comment và di chuyển task; A thấy cập nhật mà không reload.
4. C đọc được nhưng không tạo/sửa/lưu trữ bằng cả UI và request trực tiếp.
5. D không thuộc workspace không đọc được board dù biết ID; D không subscribe được dữ liệu riêng.
6. Hai phiên cùng sửa task cũ: một phiên được lưu, phiên còn lại nhận conflict và giữ bản nháp. Hai thao tác reorder cạnh tranh không gây mất/trùng task.
7. Request chậm/lỗi/mất phản hồi: không báo lưu giả, retry không thực thi trùng; reconnect phục hồi trạng thái chuẩn.
8. A gỡ B: B không còn ghi/đọc dữ liệu qua request mới hoặc nhận dữ liệu realtime riêng sau thu hồi; UI xử lý mất quyền.
9. Tải lại/deep link đúng route, dữ liệu vẫn còn. Logout ngắt subscription và xóa cache dữ liệu riêng khỏi phiên UI.
10. Môi trường triển khai có env/redirect/fallback SPA đúng; người đánh giá chạy được các luồng trên bằng ít nhất hai tài khoản thử.

Chỉ đánh dấu MVP hoàn thành sau khi các nhóm yêu cầu MVP và kịch bản liên quan đạt, kết quả được ghi vào báo cáo kiểm chứng. Kế hoạch chia mốc là thứ tự triển khai; quyền truy cập cơ bản phải có ngay từ M1, không chờ M2 mới bảo vệ dữ liệu.

## 11. Tài liệu liên quan

- [README](../README.md): cài đặt và chạy.
- [Kiến trúc](architecture.md): cấu trúc kỹ thuật và hướng tích hợp.
- [Học Vue qua mã nguồn](learning-guide.md): giải thích code hiện có.
- [Checklist thủ công local](manual-checks.md): thử lại bản starter.
- [Kết quả đã kiểm chứng](verification.md): bằng chứng cho M0, không phải nghiệm thu MVP online.
