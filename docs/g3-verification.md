# G3 — Công việc của tôi và bộ lọc cá nhân

Triển khai ngày 2026-10-03, frontend dev local + Supabase hiện tại. Migration `20261003014755_my_tasks_saved_filters_g3.sql` đã áp dụng cloud sau xác nhận của người dùng. Không có deployment public.

## Cách dùng và phạm vi

Mở **Công việc của tôi** từ sidebar/drawer hoặc `/my-tasks`. Danh sách chỉ chứa task được giao cho tài khoản hiện tại, còn membership, và task/board/workspace chưa archived. Owner không tự thấy việc được giao cho người khác. Viewer được đọc việc của mình và lưu bộ lọc cá nhân, không được ghi task.

- Đang mở: khác done. Tất cả: bao gồm done. Đã hoàn thành: chỉ done.
- Quá hạn: ngày hạn trước ngày hiện tại, chưa done. Hôm nay: hạn đúng ngày hiện tại, chưa done. 7 ngày tới: sau hôm nay đến hết ngày thứ 7, chưa done.
- Ngày hiện tại tính tại server theo timezone từng workspace; due_date giữ kiểu date. Task chưa có hạn không nằm trong các view ngày hạn.
- Search tên/mô tả theo chuỗi con, không phân biệt hoa/thường; dấu phần trăm và gạch dưới là ký tự thường. Không tìm toàn bộ task của workspace, không bỏ dấu tiếng Việt và không có full-text ranking.
- Bộ lọc nâng cao: workspace, board, status, priority, label, khoảng hạn bao gồm hai đầu. Nhập xong chọn **Áp dụng bộ lọc**; background refresh không thay nội dung đang nhập.
- Sắp xếp hạn tăng dần (không có hạn ở cuối), ưu tiên high/medium/low, mới tạo trước hoặc tên theo lower + collation C. UUID là khóa phụ ổn định. Thứ tự tên không phải collation tiếng Việt.
- 20 task/trang; URL giữ điều kiện/trang. Mở task rồi chọn **← Công việc của tôi** để quay lại đúng điều kiện. Đóng dialog vẫn giữ returnTo; auth redirect chỉ nhận đường dẫn My Tasks đã xác thực.
- Bộ lọc cá nhân tối đa 20, tên 1–60 ký tự, duy nhất theo tài khoản không phân biệt hoa/thường. Lưu/cập nhật/lưu bản mới/xóa với xác nhận. Chỉ lưu điều kiện, không chụp nội dung task.
- Workspace/board/nhãn trong preset không còn khả dụng: kết quả không lộ dữ liệu và có thông báo để đổi hoặc xóa điều kiện. Preset không tự bị xóa.

## Dữ liệu và API

`my_tasks_query(p_filters jsonb, p_page integer, p_limit integer)` trả items, total, page, limit, normalized filters, options và saved filters riêng của người gọi. Server lấy danh tính từ auth.uid(), yêu cầu email verified, kiểm tra membership/archive/assignee ở mỗi query; không nhận user_id tùy ý. Page tối đa 100000, limit 1–50; page vượt kết quả được đưa về trang cuối (tối thiểu 1).

`task_saved_filter_mutate(p_id uuid, p_version integer, p_mutation uuid, p_action text, p_name text, p_filters jsonb)` hỗ trợ save/delete. Tạo mới version 0; update/delete cần version hiện tại. Advisory transaction lock theo user chống đua quota/tên/version. Receipt theo user + mutation ID trả ACK tối thiểu; cùng request retry không ghi lần hai, kể cả sau delete. Khác nội dung cùng receipt bị từ chối; version cũ trả PT409.

Bảng `task_saved_filters` bật RLS, authenticated chỉ SELECT của mình; không có quyền ghi bảng trực tiếp. Bảng receipt nằm ở schema internal, không cấp quyền client. Index task theo assignee/board/due/id chỉ chứa task chưa archived.

Store vô hiệu hóa response cũ khi đổi query/logout. Ghi chưa rõ kết quả khóa ghi mới/điều hướng và retry đúng payload/receipt; không suy đoán đã lưu từ realtime. ACK thành công nhưng reload lỗi vẫn báo đã lưu kèm lỗi tải danh sách. Lỗi đọc xóa kết quả cũ để tránh tiếp tục hiển thị dữ liệu sau mất quyền.

Realtime boards/workspaces/membership invalidates query; fallback 30 giây khi tab hiển thị và refresh khi focus/reconnect. Preset ở phiên khác được nhận qua refresh/fallback, chưa có publication riêng. Query thành công chạy nền không bật màn hình loading toàn trang.

## Kiểm chứng

Lượt cuối ngày 2026-10-03: **156 tests / 19 files**, **19 E2E local**, **1 E2E cloud G3** đạt; production build (gồm typecheck source) và typecheck E2E đạt.

- 5 SQL tests G3: assignee/Viewer/outsider/unverified/mất membership; filter kết hợp, label/search literal/date; pagination có sort key trùng và clamp; timezone Kiritimati/Honolulu; archived task/board/workspace; input sai; RLS, direct-write denial, receipt/retry/delete, conflict và tên trùng.
- 5 store/model tests G3: response cũ/logout, fail-closed refresh, retry payload tách khỏi draft, conflict, ACK thành công nhưng reload lỗi, URL allowlist.
- 2 browser local G3: mobile 390px không overflow ngang, search, preset retry khi mất phản hồi, không tạo trùng, task deep link/quay lại, xóa preset; empty/invalid URL/mất quyền. Axe WCAG A/AA không ghi nhận vi phạm trong màn hình đã quét.
- Cloud G3: Member thấy việc mình; Owner và tài khoản ngoài workspace không thấy; realtime đổi tên/status/assignee phản ánh vào danh sách và giữ draft; hai preset writes cùng version cho một thành công/một PT409; người khác không sửa/SELECT được preset; gỡ membership làm query rỗng. Workspace QA được archive, membership QA được gỡ và preset QA được xóa. Một mẫu đổi tên đến lúc thấy trên UI đo được 1.633 ms (bao gồm RPC), không phải kết quả benchmark nhiều phiên.
- Lệnh tái kiểm tra: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run typecheck:e2e`, `npm.cmd run test:e2e`, `npm.cmd run test:e2e:cloud -- e2e-cloud/my-tasks.spec.ts`. Cloud dùng tài khoản QA trong file ignored `.env.e2e.local`.
- Evidence local: `output/playwright/g3-my-tasks-mobile.png`; cloud: `output/playwright/g3-cloud-verification.json`. Các output không đưa vào Git.

## Giới hạn và theo dõi

- Pagination ổn định khi dữ liệu không đổi; không phải snapshot xuyên nhiều request. Task đổi thứ tự/assignee có thể chuyển trang; refresh cập nhật count và clamp trang.
- Chưa benchmark query/pagination G3 trên dữ liệu lớn; chưa đo mục tiêu 100 task/5 phiên cho G3. Một mẫu realtime cloud không thay thế benchmark.
- Chưa nghiệm thu Narrator/NVDA thực tế hoặc thiết bị cảm ứng thật. Chưa kiểm thử UI mọi tổ hợp bộ lọc, ranh giới ngày qua nửa đêm, hết quota 20 preset và phân trang qua nhiều màn hình; SQL đã kiểm tra các quy tắc chính nêu trên.
- Build còn cảnh báo chunk chính trên 500 kB và annotation Zod như baseline; không hạ ngưỡng/cắt kiểm thử để ẩn cảnh báo.
- Security advisor sau migration: hai RPC G3 được gọi bởi authenticated với SECURITY DEFINER là có chủ đích, search_path rỗng và kiểm tra danh tính/quyền trong hàm; [hướng dẫn audit RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Receipt internal bật RLS không policy nhằm chặn client; [thông báo RLS không policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Cảnh báo [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) có từ trước, không thay cấu hình Auth trong G3.
