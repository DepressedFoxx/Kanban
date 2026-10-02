# G1 — Workspace Settings và vòng đời workspace

Ngày kiểm chứng: 2026-10-02. Frontend dev local, database Supabase cloud. Đã triển khai G1 và kiểm thử các luồng chính; chưa đóng toàn bộ nghiệm thu email và các trường hợp cạnh tranh được ghi riêng bên dưới.

## Sử dụng

Từ danh sách board hoặc trang thành viên, mở **Cài đặt workspace** tại `/workspaces/:workspaceId/settings`.

- Owner sửa tên, mô tả và timezone; Member/Viewer chỉ xem.
- Owner chuyển quyền cho Member hoặc Viewer hiện tại đã xác minh email. Owner cũ trở thành Member.
- Member/Viewer được rời workspace; Owner phải chuyển quyền trước. Assignment được gỡ, nội dung task/comment được giữ.
- Archive giữ dữ liệu để đọc, thu hồi lời mời đang chờ và chặn ghi board/task/comment. Owner được restore, chuyển Owner, gỡ thành viên hoặc thu hồi lời mời; Member/Viewer vẫn được rời.
- Restore không khôi phục lời mời cũ và không thay trạng thái archive riêng của board/task.
- Danh sách workspace có bộ lọc đang hoạt động/đã lưu trữ. Trạng thái archive cập nhật tới phiên board đang mở.
- Settings giữ bản nháp khi dữ liệu nền thay đổi, hiển thị conflict và xác nhận trước khi bỏ bản nháp. Request chưa rõ kết quả được retry với cùng mutation ID.
- Audit dành cho Owner, có phân trang. Tác giả không còn trong danh sách thành viên được hiển thị bằng ID rút gọn.

Account tiếp tục dùng trang hiện có để đổi tên hiển thị và gửi email khôi phục mật khẩu. Không tạo luồng Auth thứ hai.

## Database và API thực tế

Migration `20261002023448_workspace_settings_lifecycle.sql` đã áp dụng trên cloud. Không cần chạy lại thủ công.

Workspace có description, timezone, archived_at, version và updated_at. Deferred constraint kiểm tra cuối transaction: đúng một Owner và membership khớp owner_id. Receipt và audit nằm trong cùng transaction với mutation.

API đọc: `workspace_settings_get`, `workspace_activity_list`. Các mutation dùng chung `workspace_mutate(workspace, version, mutation, action, data)`, với action update/transfer/leave/archive/restore; thay cho các tên RPC riêng dự kiến trong đặc tả G0. Retry transfer/leave đã commit chỉ trả ACK tối thiểu cho đúng actor và payload, không trả snapshot sau mất quyền.

Các RPC cũ được bọc bằng kiểm tra trạng thái/khóa workspace; helper chuyển vào schema private không cho client gọi. Các đường rename/member/invitation cũ có audit/version nhưng không có hợp đồng receipt mới như workspace_mutate. Quyền tạo board hiện vẫn chỉ Owner; quyền Member tạo board trong ma trận v1 là phần mở rộng chưa triển khai.

Ngày hạn vẫn là ngày lịch. Timezone workspace quyết định hôm nay/quá hạn; không dịch due_date khi đổi timezone. Workspace/board/task archived không hiện quá hạn.

## Bằng chứng kiểm thử

| Phạm vi                | Kết quả                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Unit/store/SQL toàn bộ | 138 tests, 16 files đạt; gồm 6 SQL, 4 store và 3 timezone mới                                                              |
| E2E local hồi quy      | 10 ca hiện có + 3 ca settings đạt trong lượt 13 ca                                                                         |
| E2E settings cuối      | Cả 4 ca đạt sau bổ sung mobile; có keyboard/focus, axe, draft, validation, archive/restore, transfer/leave và conflict     |
| Cloud G1               | Đạt với 3 tài khoản: quyền, concurrent settings, realtime archive, transfer mất response/retry, leave, assignment và audit |
| Build/typecheck        | Build, app typecheck và E2E typecheck đạt; còn cảnh báo chunk size và annotation Zod                                       |

Cloud tạo workspace QA riêng `0f2c3899-b1b8-4eab-a092-7ce7eae38677`; đã khôi phục Owner ban đầu, gỡ membership thử và archive workspace sau kiểm thử. Report local bị Git ignore: `output/playwright/g1-cloud-verification.json`. Không chạy lại benchmark cloud 100 task/5 phiên trong lượt G1.

Lệnh chạy lại:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck:e2e
npx.cmd playwright test
npx.cmd playwright test --config playwright.cloud.config.ts e2e-cloud/settings.spec.ts
```

Cloud E2E cần tài khoản thử trong file local bị ignore theo cấu hình hiện có. Không đưa mật khẩu vào source hoặc report.

## Đối chiếu hợp đồng nghiệm thu

| ID  | Bằng chứng và phần còn thiếu                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| A1  | Giữ flow account hiện có; chưa nghiệm thu inbox thật, link verification/recovery hết hạn                           |
| W1  | SQL kiểm tra role, cloud Member bị chặn ghi settings                                                               |
| W2  | Cloud hai request cùng version: một thành công, một PT409; E2E giữ draft                                           |
| W3  | SQL transfer sang Viewer, E2E/cloud transfer sang Member; invariant cuối transaction                               |
| W4  | Constraint đã kiểm thử; chưa có cloud race transfer-vs-remove hoặc hai transfer                                    |
| W5  | Cloud transfer commit rồi mất response, retry qua UI; leave retry ACK, không trả settings                          |
| W6  | SQL/cloud leave gỡ assignment và chặn đọc settings mới                                                             |
| W7  | SQL/UI chặn Owner rời trực tiếp                                                                                    |
| W8  | SQL kiểm tra đường ghi khi archived, cloud realtime/comment denied; chưa mô phỏng race archive-vs-write trên cloud |
| W9  | Restore cho ghi lại, lời mời bị thu hồi; chưa có ca riêng board đã archived trước restore                          |
| W10 | Guard và ngoại lệ quản trị đã triển khai; chưa E2E mọi tổ hợp thao tác trên archived                               |
| W11 | Store kiểm tra denied và response cũ; cloud kiểm tra mất quyền sau leave, chưa E2E đầy đủ mọi tab bị gỡ từ xa      |
| W12 | Unit gần nửa đêm, năm nhuận/DST; UI đổi timezone; chưa đối chiếu hai máy vật lý                                    |
| W13 | Cloud migration thành công, backfill không thiếu, invariant không vi phạm, RLS/grants kiểm tra trực tiếp           |
| W14 | SQL receipt/audit, cloud transfer chỉ một event; chưa fault injection tất cả điểm rollback                         |

Các khoảng trống trên giữ mở để nghiệm thu cuối G1/v1; không dùng kiểm thử mock hoặc review code thay cho bằng chứng cloud tương ứng. Narrator/NVDA phát âm thực tế và thao tác trên thiết bị cảm ứng vẫn chưa nghiệm thu.

## Rà soát quyền sau migration

Kiểm tra trực tiếp: client không truy cập schema private hoặc đọc receipt; không có bảng mới thiếu RLS; không có workspace vi phạm invariant Owner.

Security advisor còn các mục cần diễn giải, không phải kết quả không có cảnh báo:

- 4 INFO [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): bảng dùng RPC, không cấp quyền đọc trực tiếp.
- 21 WARN [authenticated security-definer RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): API chủ ý kiểm tra actor/role tại server; helper private đã thu hồi quyền.
- 1 WARN [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) chưa bật từ cấu hình trước G1.

Các module G2–G5 phải tiếp tục dùng guard archive và quyền hiện có; migration này không tự bảo vệ những RPC chưa được viết.
