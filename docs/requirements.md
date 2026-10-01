# Yêu cầu dự án Kanban

> Cập nhật nghiệm thu 2026-10-01: ba tài khoản thật đã kiểm tra cloud, 125 tests SQL/unit và 10 E2E local đạt. Kết quả mới, benchmark và giới hạn xem [mvp-verification.md](mvp-verification.md). Các kết quả ở lượt triển khai trước bên dưới là lịch sử, không thay thế báo cáo mới.

Phạm vi được xác nhận ngày 2026-10-01: frontend chạy dev local, dùng Supabase cloud hiện có; chưa có kế hoạch deploy. M3 là MVP cộng tác chạy được và được nghiệm thu ở môi trường này. Deployment, hosting, domain, CI remote và vận hành production không phải điều kiện chốt MVP local. Kiểm thử nhiều tài khoản trên Supabase vẫn cần thiết, không yêu cầu deploy frontend.

Ngày lập: 2026-09-29. Cập nhật: 2026-10-01. Phiên bản tài liệu: 0.4.

**Hiện trạng 2026-10-01: Auth, workspace/thành viên, board/task, Collab và Sync đã có triển khai. Ma trận tại mục 4 mô tả quyền hiện có trong code. Đã kiểm tra cloud bằng tài khoản Owner và realtime trên hai tab cùng tài khoản; chưa nghiệm thu đầy đủ nhiều tài khoản khác vai trò hoặc M3.**

Tài liệu này cụ thể hóa phạm vi phát triển và tiêu chí nghiệm thu. Mục 4 mô tả quyền MVP hiện tại; mục 9 phân biệt phần đã triển khai với phần đã kiểm chứng. Các mục tiêu chất lượng và kịch bản nghiệm thu chưa đạt vẫn là yêu cầu cần hoàn thành, không phải cam kết tính năng đã được nghiệm thu.

## 1. Mục tiêu và người dùng

Xây dựng ứng dụng Kanban cho nhóm freelancer nhỏ, giúp quản lý dự án, phân công công việc và theo dõi tiến độ cùng nhau. Mục tiêu học tập là hiểu Vue qua ứng dụng thật: state/props/emits, computed/watch, lifecycle, composables, router, store, validation và bất đồng bộ.

Người dùng mục tiêu: nhóm 2–10 người; khách hàng có thể tham gia với quyền chỉ xem. Đây là đối tượng thiết kế, chưa phải giới hạn số thành viên được cưỡng chế trong sản phẩm.

Luồng giá trị chính: đăng nhập → tạo workspace → mời thành viên → tạo board → tạo/giao task → di chuyển task → thành viên khác thấy cập nhật → xem lịch sử thay đổi.

## 2. Định nghĩa các mốc

| Mốc                     | Ý nghĩa                                                              | Trạng thái                          |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| M0 — Starter local      | UI và logic board, dữ liệu trong một trình duyệt                     | Đã có; xem verification.md          |
| M1 — Online cá nhân     | Auth, workspace/board, lưu database với cách ly dữ liệu              | Đã triển khai; xem mục 9            |
| M2 — Nhóm có phân quyền | Membership, lời mời, quyền Owner/Member/Viewer, comment              | Đã triển khai; xem mục 9            |
| M3 — MVP cộng tác       | M1 + M2 + realtime, xử lý xung đột, activity và nghiệm thu dev local | Đang hoàn thiện; chưa nghiệm thu M3 |
| Sau MVP                 | Nâng cấp sản phẩm theo phản hồi thực tế                              | Chưa lập lịch                       |

MVP trong tài liệu này là **M3 trên dev local**, không đồng nghĩa chỉ có UI chạy được. Hoàn thành MVP local không phải tuyên bố sẵn sàng vận hành production.

## 3. Phạm vi MVP

### AUTH — Xác thực

- AUTH-01: đăng ký/đăng nhập bằng email và mật khẩu qua Supabase Auth; xác minh email trước khi sử dụng workspace.
- AUTH-02: đăng xuất, phục hồi phiên và đặt lại mật khẩu qua email.
- AUTH-03: bảo vệ route; khi hết phiên, điều hướng tới đăng nhập và cho quay lại đích hợp lệ sau đăng nhập. Không lưu mật khẩu trong ứng dụng.
- Nghiệm thu: tài khoản mới hoàn thành được luồng xác minh; refresh giữ phiên hợp lệ; sau logout không đọc được dữ liệu riêng. Hiển thị lỗi xác thực và trạng thái đang gửi, chặn submit lặp.

### WS — Workspace và thành viên

- WS-01: người dùng tạo workspace và trở thành Owner; xem/chuyển giữa các workspace mình tham gia.
- WS-02: Owner mời theo email với vai trò Member hoặc Viewer. Link một lần, hết hạn sau 7 ngày, có thể thu hồi.
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

## 4. Ma trận quyền MVP hiện tại

Các quyền dưới đây đã được thực thi trong RPC/RLS và có kiểm thử SQL local. Người dùng phải đăng nhập, xác minh email và còn membership trong workspace. UI/route guard hỗ trợ trải nghiệm; server là nơi quyết định quyền truy cập.

| Hành động                                                 | Owner       | Member      | Viewer      |
| --------------------------------------------------------- | ----------- | ----------- | ----------- |
| Đọc board/task/comment/activity, kể cả dữ liệu đã lưu trữ | Có          | Có          | Có          |
| Nhận cập nhật realtime của dữ liệu được phép đọc          | Có          | Có          | Có          |
| Xem danh sách thành viên                                  | Có          | Có          | Có          |
| Tạo/sửa/di chuyển task trong board đang hoạt động         | Có          | Có          | Không       |
| Lưu trữ/khôi phục task trong board đang hoạt động         | Có          | Có          | Không       |
| Thêm comment vào task và board đang hoạt động             | Có          | Có          | Không       |
| Tạo/đổi tên/lưu trữ/khôi phục board                       | Có          | Không       | Không       |
| Mời/gỡ người, sửa vai trò Member/Viewer                   | Có          | Không       | Không       |
| Xem danh sách lời mời, thu hồi lời mời                    | Có          | Không       | Không       |
| Đổi tên workspace                                         | Có          | Không       | Không       |
| Sửa/xóa comment                                           | Chưa hỗ trợ | Chưa hỗ trợ | Chưa hỗ trợ |
| Sửa/xóa activity log                                      | Không       | Không       | Không       |

### Điều kiện và giới hạn

- Owner/Member được sửa mọi task trong workspace, không chỉ task do mình tạo hoặc được giao. Assignee không cấp thêm quyền: Viewer được giao task vẫn chỉ có quyền xem.
- Board đã lưu trữ chỉ đọc; không tạo/sửa/di chuyển/lưu trữ/khôi phục task hoặc thêm comment trong board đó. Owner phải khôi phục board trước khi tiếp tục. Task đã lưu trữ phải được khôi phục trước khi sửa hoặc thêm comment.
- Mỗi workspace có một Owner. Chưa hỗ trợ chuyển Owner, gỡ/hạ vai trò Owner, Owner rời nhóm, xóa workspace hoặc xóa vĩnh viễn board/task.
- Mỗi tài khoản đủ điều kiện được tự tạo workspace mới. Owner ở workspace A không có quyền mặc định ở workspace B. Chưa có board riêng tư hoặc quyền riêng theo board.
- Người nhận lời mời được xem trước lời mời của mình khi email đã xác minh khớp và link còn hợp lệ; quyền này không cho phép xem danh sách lời mời hoặc dữ liệu workspace trước khi nhận lời mời.
- Collab/Sync không mở rộng quyền. Retry giữ nguyên ID/nội dung thao tác; server kiểm tra truy cập và receipt để không ghi trùng. Nếu thao tác chưa được ghi, quyền ghi hiện tại vẫn phải hợp lệ. Offline, đang lưu hoặc chưa xác nhận là trạng thái tạm chặn thao tác, không thay đổi vai trò.
- Khi bị gỡ khỏi workspace, request mới bị server từ chối. Dữ liệu đã tải trên UI được đóng khi phát hiện mất quyền qua RPC; kiểm tra định kỳ khoảng 30 giây khi tab hiển thị, có mạng và không đang giữ thao tác chưa xác nhận. Không cam kết xóa ngay dữ liệu đã tải ở tab offline. Xem [Collab](collab.md) và [Sync](sync.md).

### Mức độ kiểm chứng

- Đã có test SQL local cho allow/deny, cách ly workspace, Viewer, người ngoài nhóm, thu hồi quyền và chống ghi trùng.
- Cloud đã kiểm tra luồng Owner; realtime đã thử hai tab cùng tài khoản.
- **Chưa nghiệm thu cloud đầy đủ bằng các tài khoản Owner/Member/Viewer riêng biệt**, bao gồm thay đổi vai trò, thu hồi quyền khi đang mở board và subscription sau thu hồi. Các kịch bản tại mục 10 vẫn cần hoàn thành trước khi công nhận M3.

## 5. Màn hình và trạng thái hiện tại

Các màn hình dưới đây đã có source. “Đã triển khai” không có nghĩa mọi trạng thái đã được nghiệm thu cloud; xem mục 7 và [tổng kết MVP](mvp-summary.md).

| Màn hình         | Route hiện tại                                                                 | Nội dung và trạng thái đã triển khai                                                                                           |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Auth             | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` | Đăng nhập/đăng ký, xác minh, phục hồi mật khẩu; pending, lỗi, phản hồi xác minh và xử lý callback                              |
| Tài khoản        | `/account`                                                                     | Thông tin tài khoản, cập nhật hồ sơ/mật khẩu; validation và phản hồi thao tác                                                  |
| Workspace        | `/workspaces`                                                                  | Danh sách/tạo workspace; loading, empty, lỗi                                                                                   |
| Board list       | `/workspaces/:workspaceId/boards`                                              | Board đang hoạt động/lưu trữ, tạo board theo quyền; loading, empty, lỗi/mất quyền                                              |
| Kanban           | `/boards/:boardId`                                                             | Cột, tìm/lọc, archive, tuỳ chọn board; loading, empty, không có kết quả, chỉ đọc, offline, pending, chưa xác nhận, lỗi đồng bộ |
| Task detail      | `/boards/:boardId?task=:taskId`                                                | Bản nháp, comment/activity; validation, conflict, đối chiếu, task lưu trữ, link sai, xác nhận bỏ bản nháp                      |
| Members          | `/workspaces/:workspaceId/members`                                             | Thành viên, vai trò, lời mời; loading, lỗi, trạng thái lời mời, hành động theo quyền                                           |
| Accept invite    | `/invite/:token`                                                               | Xem trước/nhận lời mời; sai tài khoản, link không hợp lệ/hết hạn/thu hồi và phản hồi server                                    |
| Hướng dẫn        | `/guide`                                                                       | Hướng dẫn sử dụng                                                                                                              |
| Board cá nhân cũ | `/personal-board`                                                              | Board localStorage, tách dữ liệu online; không phải luồng chính của MVP cộng tác                                               |

`/` và `/board` chuyển tới `/workspaces`. Query chia sẻ task là `task`, không phải `taskId`. Nguồn đối chiếu: [router](../src/router/index.ts), [auth config](../src/features/auth/config.ts).

Còn cần nghiệm thu: toàn bộ luồng email xác minh/reset với redirect về dev local, lời mời và trạng thái mất quyền bằng tài khoản khác; responsive/bàn phím trên các màn hình online với đủ trạng thái lỗi. Không dùng kết quả mobile của starter M0 để kết luận toàn bộ MVP online đạt.

## 6. Dữ liệu và quy tắc nhất quán hiện tại

| Nơi lưu thực tế         | Vai trò và quy tắc                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.users`            | Danh tính do Supabase Auth quản lý; tên hiển thị lấy từ user metadata. Chưa có bảng `profiles` riêng; metadata hiển thị không quyết định quyền. |
| `workspaces`            | Tên, owner, thời điểm tạo; liên kết người tạo/owner tới Auth.                                                                                   |
| `workspace_members`     | Khoá ghép workspace/user ngăn membership trùng; role Owner/Member/Viewer; unique index giới hạn một Owner, RPC tạo workspace kèm Owner.         |
| `workspace_invitations` | Email chuẩn hoá, vai trò, hash token, hạn 7 ngày, thời điểm nhận/thu hồi; chỉ email đã xác minh khớp mới được nhận.                             |
| `boards`                | Thuộc workspace; tên, archive, người tạo/thời điểm tạo và `version` dùng kiểm soát ghi đồng thời.                                               |
| `board_tasks`           | Thuộc board; title, description, `status`, priority, assignee, due date, position, archive, created_at. Không có version riêng từng task.       |
| `board_mutations`       | Khoá board/actor/mutation ID và request gốc; dùng chống ghi trùng, không cho tái sử dụng ID với payload khác.                                   |
| `task_comments`         | Task, nội dung thuần văn bản, actor/tên/thời điểm do server xác nhận; comment ID dùng chống gửi trùng.                                          |
| `task_activity`         | Log do server tạo trong transaction, actor/tên/thời điểm và before/after; không có API sửa/xóa log.                                             |

Không có bảng `columns`: bốn cột cố định được biểu diễn bằng `board_tasks.status` (`todo`, `doing`, `review`, `done`). Chuỗi liên kết thực tế là task → board → workspace, được bảo vệ bằng foreign key, RLS và RPC.

Các quy tắc đã triển khai:

- RPC kiểm tra membership/role; client không ghi trực tiếp các bảng nghiệp vụ. Quyền đọc trực tiếp tuân theo RLS.
- Board version bảo vệ cả sửa nội dung và thứ tự. Ghi/reorder dùng transaction và khoá; version cũ bị từ chối, không tự ghi đè.
- Assignee phải còn trong workspace. Gỡ membership bỏ assignment và làm thay đổi phiên bản liên quan. Assignee không thay thế role.
- Comment/activity gắn đúng task; thay đổi thất bại không được sinh log thành công. Retry giữ nguyên receipt để tránh ghi lặp.
- Realtime chỉ báo cần tải lại; snapshot/thread RPC là nguồn dữ liệu chính. Giữ bản nháp khi nhận snapshot; response cũ sau cleanup không phục hồi state.
- Dữ liệu local không tự import online. Không lưu hàng đợi offline hoặc bản nháp qua reload.

Source schema: [migrations](../supabase/migrations). Migration 001–004 đã áp dụng theo các lượt thiết lập trước; migration realtime `20261001013707_collab_realtime.sql` đã áp dụng cloud ngày 2026-10-01. File migration realtime hiện còn chưa commit cùng thay đổi Collab/Sync. Test SQL local không thay thế kiểm thử cạnh tranh bằng nhiều connection/cloud.

## 7. Yêu cầu chất lượng và mức độ kiểm chứng

Giữ nguyên các tiêu chí nghiệm thu; không hạ tiêu chí để đánh dấu hoàn thành.

| Tiêu chí                                                        | Bằng chứng hiện có                                                                                          | Phần còn phải hoàn thành                                                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop/mobile từ 390px, không tràn ngang trang                 | Đã có layout responsive, drawer, menu chuyển task; kiểm tra trình duyệt ở các lượt UI và Sync               | Nghiệm thu lại toàn bộ màn hình online ở 390px/iPad/desktop; kiểm tra cảm ứng trên thiết bị thật                                             |
| Label, focus, bàn phím/Escape, giải thích hành động bị chặn     | Có component truy cập được bằng bàn phím và test bảo vệ dialog; Sync đã kiểm tra mở/đóng task bằng bàn phím | Audit nhất quán các form, lỗi và focus ở toàn bộ luồng; chưa có báo cáo accessibility toàn app                                               |
| Không báo lưu giả, giữ draft, phân biệt loading/empty/error     | Test UI/store và Sync; timeout, retry, stale response, offline, conflict                                    | Kiểm thử mất phản hồi sau server commit và reconnect trên cloud, không chỉ mock                                                              |
| Authorization độc lập UI, cách ly workspace, comment text thuần | SQL local allow/deny/RLS; test comment không render HTML; frontend dùng publishable key                     | Nghiệm thu cloud Owner/Member/Viewer/người ngoài, request trực tiếp và subscription sau thu hồi; kiểm tra bundle build local không có secret |
| 100 task/board, 5 phiên, event tới phiên khác trong 2 giây      | Chưa benchmark; thử realtime hai tab cùng tài khoản không phải kết quả đo tải                               | Tạo dataset thử riêng, ghi môi trường/mạng, số lần thử và độ trễ từ commit đến UI; xác nhận không mất/trùng task                             |
| Migration có trong Git, dữ liệu kiểm thử tách biệt              | Có migration và fixture SQL local; không tự import board local                                              | Commit thay đổi mới; chuẩn bị seed/reset an toàn cho E2E/staging; cloud QA hiện không chứng minh đã có môi trường staging riêng              |
| Format, typecheck, test, build, CI và E2E                       | Lượt Sync ngày 2026-10-01: 124 test/13 file đạt, build/typecheck/format đạt; có workflow CI                 | Đã có suite E2E local và cloud; GitHub CI chưa xác minh nhưng không chặn MVP local                                                           |
| Môi trường dev local                                            | Có hướng dẫn cấu hình và migration                                                                          | Nghiệm thu env, auth redirect về localhost, refresh/deep link và logout trên dev server; không yêu cầu deployment                            |

Workflow hiện tại: [ci.yml](../.github/workflows/ci.yml) chạy `npm ci`, format, test và build (build gồm typecheck). Kết quả local không đồng nghĩa CI remote đã chạy; chạy CI remote để sau khi có nhu cầu phát hành. Format, test, typecheck/build và E2E vẫn phải kiểm tra ở local. Build còn cảnh báo annotation Zod và chunk trên 500 kB; chưa có bằng chứng đạt ngân sách hiệu năng.

Báo cáo [verification.md](verification.md) là bằng chứng lịch sử của M0 ngày 2026-09-29, không phải báo cáo nghiệm thu MVP online. Bằng chứng mới và checklist chốt M3 ở [mvp-summary.md](mvp-summary.md).

## 8. Phạm vi sau MVP và giới hạn bản hiện tại

Các nhóm dưới đây **chưa thuộc điều kiện hoàn thành M3** và chưa được triển khai trong lượt tổng kết này:

| Nhóm                | Phạm vi để sau MVP                                                                   |
| ------------------- | ------------------------------------------------------------------------------------ |
| Kinh doanh          | Billing/subscription, thanh toán                                                     |
| Năng suất           | AI, biểu đồ nâng cao, calendar, automation rules                                     |
| Trao đổi/tài nguyên | Upload file, mention, thông báo/nhắc hạn ngoài email auth; Presence/typing indicator |
| Tuỳ biến/phân quyền | Nhiều assignee, board riêng tư, cột tuỳ biến, chuyển Owner/xóa workspace             |
| Nền tảng            | Offline-first/hàng đợi ghi, lưu draft qua reload, mobile native                      |

Lời mời hiện dùng link Owner chia sẻ; không coi đó là dịch vụ tự gửi email mời. Các giới hạn đang áp dụng vẫn phải được giải thích trong UI/tài liệu, không biến thành lời hứa đã có tính năng.

Deployment/hosting/domain, cấu hình SPA fallback trên hosting và nghiệm thu URL phát hành được để sau khi người dùng quyết định deploy; không chặn MVP dev local.

Trước khi vận hành production cần quyết định và kiểm chứng backup/restore, giám sát, hỗ trợ, chi phí và chính sách dữ liệu. Đây là công việc chuẩn bị vận hành; không phải lý do mở rộng MVP bằng billing/AI hoặc các tính năng ngoài phạm vi.

## 9. Hiện trạng so với yêu cầu

- Auth/workspace: có Supabase Auth, tạo workspace, membership và lời mời. Cloud đã kiểm tra Owner/Member/Viewer và người ngoài; xem báo cáo nghiệm thu mới.
- Board/task: nhiều board online, task CRUD qua RPC, assignee membership, tìm/lọc, drag-and-drop, archive/restore, kiểm soát phiên bản và retry. Xem [module board](boards.md).
- Board cá nhân cũ: localStorage tại `/personal-board`, giữ nguyên dữ liệu cũ; không tự import online.
- Cộng tác: đã có bình luận và lịch sử task qua migration 003; xem [module task](tasks.md). Đã có realtime kèm kiểm tra định kỳ dự phòng; xem [Collab](collab.md). Chưa nghiệm thu M3.
- Sync: deadline 15 giây, retry giữ nguyên receipt/payload, trạng thái xác nhận và bảo vệ điều hướng trong phiên; xem [Sync](sync.md). Không có hàng đợi ghi offline hoặc lưu bản nháp qua reload.
- Kiểm thử tại lần triển khai Sync ngày 2026-10-01: 124 test local đạt; build/typecheck đạt. Cloud Owner đã kiểm tra các thao tác board/task chính và realtime hai tab cùng tài khoản. Không đồng nghĩa nghiệm thu concurrent writes nhiều connection hoặc nhiều tài khoản; lỗi mạng/timeout mới kiểm thử bằng mock có kiểm soát.

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
10. Dev server local có env và Supabase auth redirect đúng; refresh/deep link/logout hoạt động. Chạy các luồng trên bằng các tài khoản thử khác vai trò, không cần URL deploy.

Chỉ đánh dấu MVP hoàn thành sau khi các nhóm yêu cầu MVP và kịch bản liên quan đạt, kết quả được ghi vào báo cáo kiểm chứng. Kế hoạch chia mốc là thứ tự triển khai; quyền truy cập cơ bản phải có ngay từ M1, không chờ M2 mới bảo vệ dữ liệu.

## 11. Tài liệu liên quan

- [README](../README.md): cài đặt và chạy.
- [Kiến trúc](architecture.md): cấu trúc kỹ thuật và hướng tích hợp.
- [Học Vue qua mã nguồn](learning-guide.md): giải thích code hiện có.
- [Checklist thủ công local](manual-checks.md): thử lại bản starter.
- [Kết quả đã kiểm chứng](verification.md): bằng chứng cho M0, không phải nghiệm thu MVP online.

- [Collab](collab.md): realtime, phạm vi subscription và kiểm chứng.
- [Sync](sync.md): lưu an toàn, retry và giới hạn trong phiên.

- [Tổng kết MVP và checklist chốt M3](mvp-summary.md): trạng thái, bằng chứng và phần còn thiếu.
