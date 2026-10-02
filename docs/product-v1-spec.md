# Đặc tả G0 và hợp đồng triển khai G1

Ngày: 2026-10-02. G0 hoàn thành ở mức đặc tả dựa trên source/migration trong repository; G1 đã triển khai và migration đã áp dụng cloud. Xem [kết quả, API thực tế và khoảng trống nghiệm thu G1](g1-verification.md). Baseline bên dưới giữ lại hiện trạng trước G1 để đối chiếu. Các quyết định dưới đây là mặc định của kế hoạch v1, thay đổi sau này phải cập nhật đặc tả và test tương ứng.

## 1. Baseline được đối chiếu

| Nguồn                                     | Hiện trạng                                                               | Chênh lệch cần xử lý                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/features/auth/views/AccountView.vue` | Đổi display name, email readonly, gửi email reset                        | Giữ lại luồng hiện có; nghiệm thu inbox/recovery thực tế                         |
| Migration `202609300001_workspaces.sql`   | Workspace có name/owner_id/created_at; membership và lời mời 7 ngày      | Chưa có description, timezone, archive, version hoặc chuyển Owner/rời nhóm       |
| Index `workspace_one_owner`               | Unique một owner trên workspace                                          | Chỉ bảo đảm tối đa một, không bảo đảm tồn tại hoặc đồng nhất owner_id            |
| Workspace API/config                      | List/create/rename, thành viên, invitation; tên tối đa 80                | Chưa có settings snapshot, receipt cho thao tác settings hoặc audit workspace    |
| Migration board                           | Board version và mutation receipt; trigger gỡ member bỏ assignment       | Tái sử dụng cơ chế gỡ assignment, không viết đường xóa membership bỏ qua trigger |
| Migration task                            | Comment/activity có actor_id nullable khi xóa Auth user; index theo task | Chưa có sửa/xóa comment; xóa Auth user vẫn bị các FK khác chặn                   |
| `src/features/tasks/model.ts`             | due_date kiểu date; overdue theo localDateKey của máy                    | G1 chuẩn hóa timezone workspace, giữ nguyên giá trị ngày cũ                      |
| Migration realtime                        | Publication có boards, workspace_members, task_comments, task_activity   | G1 cần invalidation settings workspace và xử lý archive ở các đường ghi          |

Index đã có: workspace_members(user_id,workspace_id), invitations(workspace_id), boards(workspace_id), board_tasks(board_id,status,position,id), comments(task_id,created_at,id), activity(task_id,id), cùng primary/unique keys. Không thêm lại index chỉ vì tên bảng xuất hiện trong roadmap.

Bằng chứng lịch sử ngày 2026-10-01: 125 tests/13 files, 10 E2E local; cloud nhiều tài khoản và benchmark 100 task/5 phiên. Lượt cloud cuối còn kiểm tra comment qua UI Owner/Member/Viewer, giữ draft/focus, accessibility tree và Escape. Đây không phải lần chạy lại tại G0. Narrator/NVDA thực tế, thiết bị cảm ứng và email verification/recovery từ inbox vẫn chưa nghiệm thu.

## 2. Quyền v1

Các quyền bên dưới yêu cầu tài khoản verified còn membership. Người ngoài bị chặn cả RPC/RLS; không dựa vào user_metadata để quyết định quyền. Quyền của Viewer giữ nguyên chỉ đọc.

| Hành động                               | Owner                           | Member               | Viewer |
| --------------------------------------- | ------------------------------- | -------------------- | ------ |
| Đọc workspace/board/task/file được phép | Có                              | Có                   | Có     |
| Đọc settings thông thường               | Có                              | Có                   | Có     |
| Sửa settings, danh mục nhãn             | Có                              | Không                | Không  |
| Mời, đổi role, gỡ thành viên            | Có; không gỡ Owner              | Không                | Không  |
| Chuyển Owner                            | Có                              | Không                | Không  |
| Rời workspace                           | Phải chuyển Owner trước         | Có                   | Có     |
| Archive/restore workspace, export       | Có                              | Không                | Không  |
| Tạo board                               | Có                              | Có                   | Không  |
| Đổi tên/archive/restore board           | Có                              | Không                | Không  |
| Ghi task/checklist/gắn nhãn             | Có                              | Có                   | Không  |
| Thêm comment                            | Có                              | Có                   | Không  |
| Sửa comment                             | Chỉ comment của mình            | Chỉ comment của mình | Không  |
| Xóa comment                             | Của mình hoặc quản trị có audit | Chỉ của mình         | Không  |
| Upload file                             | Có                              | Có                   | Không  |
| Xóa file                                | Mọi file có audit               | File mình upload     | Không  |
| Audit quản trị và export toàn workspace | Có                              | Không                | Không  |

Comment/file/task trên board hoặc task archived không được ghi. Workspace archived có quy tắc ngoại lệ tại mục 3; bảng này không có nghĩa các tính năng tương lai đã triển khai.

## 3. Vòng đời workspace và ownership

- Workspace có đúng một Owner; `workspaces.owner_id` khớp membership role owner. Không tạo Admin/Guest.
- Chuyển Owner cho thành viên verified hiện tại, khác bản thân; cho phép Member hoặc Viewer. Owner cũ trở thành Member. Cả hai bước membership và owner_id commit trong cùng transaction.
- Mọi mutation quản trị khóa workspace trước các bản ghi con, kiểm tra role/version sau khi khóa. Hai lần chuyển đồng thời: tối đa một thành công, lần còn lại conflict hoặc mất quyền; không ghi đè im lặng.
- Archive giữ nguyên board/task/membership/file; không sửa trạng thái archive riêng của từng board/task. Restore workspace không tự restore board/task đã archived từ trước.
- Archived: các thành viên vẫn đọc được; chặn task/comment/file writes, tạo board, rename/settings, đổi role, mời và nhận lời mời. Ngoại lệ: Owner restore, transfer Owner, gỡ member, revoke invitation, export; Member/Viewer được rời. Đây là thao tác quản trị quyền, cần audit.
- Archive thu hồi tất cả invitation đang chờ. Restore không hồi sinh link cũ; Owner phải mời lại.
- Rời/gỡ nhóm bỏ assignment qua trigger hiện có, tăng board version tương ứng; giữ task, comment, activity và danh tính tác giả. Rời nhóm không xóa Auth account hoặc nội dung đã tạo.
- Owner không được rời/gỡ chính mình nếu chưa chuyển Owner. Không có auto-transfer hoặc hard delete trong G1.
- Request mới mất quyền bị chặn ngay ở server. UI xóa dữ liệu khi phát hiện mất quyền; realtime invalidation + kiểm tra dự phòng khi online, không hứa xóa tức thời dữ liệu đã tải trên máy offline.

## 4. Ngày hạn và giới hạn nghiệp vụ

- `due_date` là ngày lịch `YYYY-MM-DD`, không phải timestamp. Không dịch ngày cũ qua UTC khi migration.
- Workspace thêm IANA timezone, mặc định `Asia/Bangkok` cho workspace cũ/mới trong v1 này. Owner được đổi khi workspace active; UI giải thích thay đổi cách tính hôm nay/quá hạn, không đổi ngày hạn đã nhập.
- Quá hạn khi due_date nhỏ hơn ngày hiện tại của timezone workspace, status khác done, task/board/workspace active. Hạn hôm nay chưa quá hạn. My Tasks nhiều workspace dùng timezone của từng task, không timezone trình duyệt.
- G1 áp dụng quy tắc chung cho badge/filter; server áp dụng cùng quy tắc cho truy vấn sau này. Test hai phía nửa đêm, năm nhuận và timezone có DST.
- Settings: name trim 1–80 ký tự; description text thuần 0–1000 ký tự; timezone phải là định danh được server hỗ trợ. Giới hạn backend và validation UI nhất quán.

## 5. Quy tắc G2–G5 đã chốt cho v1

### Task, labels, checklist và comment

- Nhãn workspace do Owner quản lý, tên trim 1–40 ký tự không trùng khi so không phân biệt hoa thường; xóa nhãn chỉ bỏ liên kết, không xóa task. Mỗi workspace tối đa 100 nhãn, task tối đa 20 nhãn.
- Checklist tối đa 100 mục/task, nội dung trim 1–300 ký tự. Nhân bản sao chép nội dung task, labels và checklist nhưng reset tick; không copy comment/activity/file, lịch sử mới riêng.
- Bulk ban đầu tối đa 50 task cùng board, đổi status hoặc archive, all-or-nothing với board version/receipt. Khác board thực hiện riêng với kết quả rõ.
- Comment text thuần; giữ giới hạn hiện có trong taskConfig. Sửa không giới hạn thời gian nhưng cần còn quyền ghi và là tác giả; version chống mất cập nhật, có edited_at. Xóa tạo tombstone: giữ ID/tác giả/thời gian, body null, deleted_at; không trả body cũ qua API.
- Owner xóa để quản trị phải nhập lý do; audit lưu actor/action/target/lý do, không lưu bản sao nội dung comment. Không hỗ trợ restore comment trong v1.

### Attachment

- Tối đa 10 MiB/file, 20 file/task, 500 MiB/workspace, gồm dữ liệu archived. Đây là giới hạn sản phẩm v1, không phải mô tả quota nhà cung cấp.
- Allowlist ban đầu: PNG, JPEG, WebP, PDF, TXT; tên gốc chỉ là metadata. Không cho HTML/SVG/executable; không preview tài liệu chủ động. MIME và phần mở rộng không thay thế kiểm tra nội dung file.
- Private storage, object key UUID theo workspace/task. Reserve quota có khóa trước upload, confirm metadata sau upload; reservation hết hạn sau 30 phút, job dọn phải có retry/receipt và không xóa file còn được tham chiếu.
- Server kiểm tra quyền trước cấp URL tải; URL có hạn tối đa 60 giây. Mất quyền không thu hồi được bản đã tải và có thể không thu hồi được URL còn hạn; UI/tài liệu ghi rõ.
- Nếu hạ tầng chưa hỗ trợ validation/quota/dọn file đúng hợp đồng thì attachment chưa đạt G5; không chỉ kiểm tra ở frontend.

### Export và khôi phục

- Export v1 là JSON UTF-8, schema_version=1, exported_at UTC, workspace, members (không email), boards, tasks, labels, checklist, comments, activity và attachment metadata. Giữ ID và timestamp, kèm manifest số lượng; cùng một snapshot nhất quán.
- Không xuất Auth records, password/token, invitation token/hash, mutation receipts, preferences/notifications cá nhân. Không bao gồm binary file; manifest phải ghi rõ metadata_only và file bị loại trừ.
- Export chỉ Owner; workspace archived vẫn export được. Export JSON không phải backup Auth/Storage.
- G5 thử restore kỹ thuật ở QA từ backup phù hợp gồm database và file cần thiết; không hứa có UI import JSON trong v1. Ghi mapping danh tính và quyền sau restore, không nhập dữ liệu thử vào workspace người dùng.

## 6. Thiết kế G1 có thể triển khai

### Màn hình và module

- Giữ `/account`: tên hiển thị và email reset, thêm giải thích trạng thái và test recovery thay vì xây trùng.
- Thêm `/workspaces/:id/settings`: tổng quan (name/description/timezone), thành viên/lời mời link tới màn hình có sẵn, vòng đời (transfer/leave/archive/restore), audit chỉ Owner. Member/Viewer thấy thông tin readonly và nút rời nhóm.
- Dialog transfer chọn member, nêu rõ Owner cũ thành Member; archive xác nhận tên và thu hồi invitation; leave mô tả bỏ assignment. Không đóng form khi kết quả request chưa xác nhận.
- Cập nhật workspace config/model/api/store, router và navigation theo cấu trúc hiện có; tạo SettingsView và components theo nhu cầu, không tạo global store khổng lồ.
- Danh sách workspace phân active/archived; board/task hiện banner readonly. Deep link archived vẫn đọc được; mất quyền hiện thông báo và đường quay về danh sách.

### Schema thiết kế G0 (migration G1 đã triển khai)

- workspaces: thêm description, timezone, archived_at, version, updated_at. Backfill tương thích các hàng hiện có.
- workspace_mutations: workspace_id, actor, mutation_id, request, result tối thiểu; unique theo workspace/actor/mutation. Receipt không chứa invitation plaintext hoặc dữ liệu nhạy cảm.
- workspace_activity: ID ổn định, workspace_id, actor_id, action, target_id, changes giới hạn, created_at; append-only, đọc Owner qua RPC. Index mới chỉ cho cursor `(workspace_id, id)` nếu truy vấn dùng nó.
- Bổ sung ràng buộc kiểm tra đúng một Owner và owner_id đồng nhất tại cuối transaction; kiểm thử transfer qua unique partial index hiện có. Không chỉ dựa vào UI hoặc giả định mọi thao tác đi qua một function.
- Audit membership/settings/archive trong cùng transaction; dùng một nơi ghi để tránh trigger và RPC sinh log trùng.

### Hợp đồng RPC

Tên dưới đây là thiết kế G0. G1 thực tế dùng workspace_mutate với action update/transfer/leave/archive/restore thay cho năm RPC mutation riêng; hai RPC đọc giữ nguyên. Audit lưu đối tượng trong changes. Xem báo cáo G1 để đối chiếu.

| RPC                         | Đầu vào/kết quả                      | Yêu cầu                           |
| --------------------------- | ------------------------------------ | --------------------------------- |
| workspace_settings_get      | workspace → snapshot/version/role    | Member verified, readonly         |
| workspace_update            | workspace, version, mutation, fields | Owner active; whitelist fields    |
| workspace_transfer_owner    | workspace, version, mutation, target | Owner, target còn verified/member |
| workspace_leave             | workspace, version, mutation         | Member/Viewer; không Owner        |
| workspace_archive / restore | workspace, version, mutation         | Owner; transition hợp lệ          |
| workspace_activity_list     | workspace, cursor, limit ≤50         | Owner; thứ tự ổn định             |

- Mutation thành công tăng workspace version đúng một lần và ghi receipt/audit atomically. Payload mutation ID tái sử dụng khác nội dung bị từ chối.
- Retry sau transfer/leave đã mất quyền: chỉ actor đã authenticated và đúng receipt được nhận ACK tối thiểu cho thao tác cũ, không trả snapshot hoặc thực thi lại; kiểm tra payload trước ACK. Request mới vẫn kiểm tra quyền hiện tại.
- Lỗi version dùng PT409; không dùng SQLSTATE 40001 cho xung đột nghiệp vụ. Denied dùng 42501, input/state invalid dùng 22023 với mã nghiệp vụ rõ. Network/timeout không được coi là chắc chắn thất bại.
- `workspace_list` và model cần description/timezone/archive/version. Nếu thay đổi return table signature phải migration drop/recreate an toàn và tái áp grants; không giả định CREATE OR REPLACE đổi được kiểu trả về.
- Các RPC cũ rename/member/invite/accept, board_create/board_mutate, task_comment_add đều phải đi qua workspace lock/state guard phù hợp. Không để đường cũ bypass archive/version/audit. Invitation preview từ chối link đã thu hồi/archived.
- Read RPC vẫn trả được dữ liệu archived cho thành viên. workspace_role giữ vai trò membership; không làm mất quyền đọc chỉ để chặn write.
- Invalidation workspace phải làm mới quyền/settings ở board/thread, giữ draft khi update thông thường, khóa ghi khi archive. Chỉ invalidate không được coi là security boundary; RPC/RLS vẫn quyết định.

## 7. Tiêu chí nghiệm thu G1

| ID  | Tình huống                                      | Kết quả bắt buộc                                                                    |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| A1  | Account đổi tên, recovery valid/invalid/expired | Profile đúng, feedback rõ; inbox thật ghi riêng, không dùng mock để đánh dấu đạt    |
| W1  | Member/Viewer sửa settings qua RPC              | Denied, DB/audit không đổi                                                          |
| W2  | Hai Owner sessions sửa cùng version             | Một thành công, một PT409; draft phiên thua còn                                     |
| W3  | Chuyển cho Member/Viewer                        | Đúng một Owner, owner_id khớp; Owner cũ thành Member                                |
| W4  | Target vừa bị gỡ hoặc transfer cạnh tranh       | Không orphan Owner, không cập nhật dở dang                                          |
| W5  | Transfer/leave commit nhưng mất response        | Retry cùng receipt ACK thành công, không duplicate, không lộ snapshot sau mất quyền |
| W6  | Member rời có task được assign                  | Membership xóa, assignment null, board version tăng; task/comment còn               |
| W7  | Owner rời trực tiếp                             | Bị chặn, hướng dẫn chuyển quyền                                                     |
| W8  | Archive đồng thời task/comment write            | Thứ tự theo lock; sau archive không có write bypass, invitation pending revoked     |
| W9  | Restore workspace có board archived trước đó    | Board vẫn archived; lời mời cũ không dùng lại được                                  |
| W10 | Workspace archived quản trị                     | Chỉ các ngoại lệ ở mục 3 được phép                                                  |
| W11 | Gỡ quyền trong tab settings/task đang mở        | Request mới denied, UI xử lý cache/focus; không restore state bằng response cũ      |
| W12 | Đổi timezone gần nửa đêm                        | Ngày hạn không dịch; badge/filter nhất quán giữa hai máy                            |
| W13 | Migration từ dataset cũ                         | Backfill đủ, data/grants/RLS đúng, không mất task/comment                           |
| W14 | Audit/retry/transaction rollback                | Một action thành công có một event; rollback không có log thành công                |

Unit/store tests cho draft/error/receipt; SQL tests cho invariant/RLS/transaction; cloud E2E nhiều session cho race/realtime/timeout; keyboard/axe cho UI mới. G1 chỉ hoàn thành khi có kết quả, ngày/môi trường và giới hạn ghi rõ.

## 8. Lát cắt triển khai tiếp theo

1. Migration settings/version và snapshot/update API, SettingsView; giữ tương thích danh sách/member hiện có.
2. Transfer/leave + invariant + receipt/audit; kiểm thử race và mất response.
3. Archive/restore và kiểm tra toàn bộ đường ghi cũ, invitation, board/thread UI.
4. Timezone nhất quán, invalidation workspace và account recovery QA.
5. Chạy nghiệm thu G1, cập nhật tài liệu và chia commit theo trạng thái code/schema/test nhất quán.

G2–G5 còn cần thiết kế kỹ thuật cụ thể khi tới mốc, nhưng các quy tắc sản phẩm mục 2–5 là đầu vào chung. Không tự triển khai Admin, Guest, hard delete hoặc deployment trong G1.
