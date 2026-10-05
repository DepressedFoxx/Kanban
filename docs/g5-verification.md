# G5 — Attachment, export và khôi phục

Ngày: 2026-10-05. **Đã triển khai G5 local/cloud và đạt E2E cloud**, gồm upload/download/xoá, phân quyền, retry, realtime, export và restore QA. Frontend tiếp tục chạy dev local.

## Phạm vi

- UI file đính kèm trong task: upload, trạng thái chưa xác nhận, retry cùng UUID, download, xoá có xác nhận; Owner xoá file của người khác phải nhập lý do.
- Private bucket `task-attachments`. Chỉ Edge Function `task-files` dùng quyền server; client không có quyền ghi Storage hay gọi API reserve/confirm/GC trực tiếp.
- Edge xác minh token bằng Auth `getUser`, yêu cầu email đã xác minh; user ID lấy từ Auth. SQL kiểm tra membership/role/archive cho từng thao tác.
- PNG/JPEG/WebP/PDF/TXT; kiểm tra cấu trúc/signature hoặc UTF-8 trên server, không tin MIME trình duyệt. Đây **không phải antivirus hoặc bộ giải mã tài liệu đầy đủ**. Không preview; URL download dùng Content-Disposition attachment.
- 10 MiB/file, 20 file/task, 500 MiB/workspace, tính cả archived/pending/deleting. Khoá workspace trước reserve; chỉ công bố metadata sau confirm đối tượng Storage có đúng kích thước.
- Pending hết hạn sau 30 phút; GC mỗi 5 phút, lease 2 phút, tối đa 50 đối tượng/lượt. Retry chỉ đối tượng pending/deleting/deleted còn object; không chọn ready. Xoá bằng Storage API, không xoá dòng storage.objects bằng SQL.
- Signed URL 60 giây. Mất quyền chặn cấp URL mới; URL đã cấp có thể còn hiệu lực đến hết TTL và không thu hồi được bản đã tải. Response Edge no-store; upload cache-control=0.
- Owner export JSON UTF-8 schema_version=1 trong một snapshot SQL, gồm archived. Manifest liệt kê số lượng và `files: metadata_only`. Không có binary, Auth, invitation secrets, receipts, preferences hay notifications.

## Bằng chứng local hiện có

- 6 kiểm thử SQL/server: quyền, quota, retry, confirm, moderation, GC lease/late object, export và restore.
- 3 kiểm thử nội dung/stream: UTF-8, giả loại file, PNG CRC và giới hạn byte thực tế; thêm kiểm thử Input giữ IME và không gán file path vào v-model.
- Deno check Edge entrypoint đạt.
- Toàn bộ SQL/unit/component: **177 tests / 24 files passed**. E2E local: **21 ca đạt** (19 ca qua trong lượt đầy đủ; 2 ca chạy lại đạt sau khi sửa template). Không bỏ hoặc giảm assertion. E2E typecheck và format check đạt.
- Build (gồm typecheck) đạt. Hai cảnh báo annotation Zod và bundle chính khoảng 653 kB là cảnh báo hiện có; tối ưu thuộc G6.

## Bằng chứng cloud

- Migration tính năng, Edge Function `task-files` và pg_cron/pg_net đã áp dụng sau phê duyệt người dùng.
- `npm.cmd run test:e2e:cloud -- e2e-cloud/attachments.spec.ts`: **1 passed**. Ba tài khoản QA Owner/Member/Viewer; hai trình duyệt mobile độc lập. Mô phỏng response upload bị mất sau khi server đã lưu; retry cùng UUID trả một file. Phiên khác nhận thay đổi qua board realtime.
- File TXT UTF-8 thật được lưu vào Storage, download signed URL có attachment disposition; SHA-256/byte count khớp. File giả PNG bị 415, Viewer upload bị 403, gọi Storage trực tiếp/API server bằng user token bị từ chối, Owner xoá file người khác cần lý do, thành viên bị gỡ không được cấp URL mới.
- Export qua cả RPC và nút UI, Member bị từ chối. Dữ liệu QA có task, comment, checklist, nhãn, lịch sử và file; restore giữ liên kết FK và ba role.
- Báo cáo máy: `output/playwright/g5-cloud-verification.json`; snapshot/binary backup ở `output/playwright/g5-backup`, binary restore ở `output/playwright/g5-restore` (đều ignored). Ảnh mobile: `g5-task-mobile.png`, `g5-export-mobile.png`. Axe trang settings không có vi phạm A/AA và không tràn ngang; không thay thế thử screen reader thực tế.
- Cleanup chạy thật qua pg_net: request 2 trả HTTP 200, `claimed=1, removed=1`; object QA chuyển deleted và không còn trong Storage. Lịch `kanban-attachment-cleanup` active, mỗi 5 phút. Tổng object trong bucket sau cleanup QA: 0.
- Bucket private, giới hạn 10 MiB; authenticated không có EXECUTE attachment_service/attachment_gc, anon không có EXECUTE workspace_export. Dữ liệu workspace người dùng không bị thay đổi.
- `npm.cmd audit --omit=dev`: 0 vulnerabilities. Security advisor: 12 INFO RLS/no-policy (tăng 2 bảng internal deny-by-default), 30 WARN authenticated SECURITY DEFINER (tăng 2 API có kiểm tra quyền), cảnh báo leaked-password protection cũ. Tham khảo [RLS/no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Không báo advisor hoàn toàn sạch.

## Áp dụng cloud

1. Migration `supabase/migrations/20261005030033_attachments_export_g5.sql`.
2. Deploy `supabase/functions/task-files/{index,handler,validation}.ts`; `verify_jwt=false` vì có custom authentication: user JWT được kiểm tra bằng getUser, GC có secret 256-bit trong bảng private. Không bỏ custom authentication.
3. Chạy `supabase/operations/enable_attachment_cleanup.sql` để bật pg_net/pg_cron, tạo secret server và lịch 5 phút. Frontend vẫn chạy dev local; không deploy frontend.
4. Test upload/download/xoá ba role, storage trực tiếp, lost-response retry, revoke và GC trên dữ liệu QA. Không đánh dấu cloud đạt chỉ dựa vào migration thành công.

Deploy bằng CLI từ thư mục dự án nếu dùng CLI đã đăng nhập:

```powershell
npm.cmd exec --yes --package=supabase -- supabase functions deploy task-files --project-ref xhycrgdupstnxnbfyezk --no-verify-jwt
```

Không đưa service key vào `.env` frontend. Edge dùng secret mặc định được Supabase cấp cho server. Với project mới, đổi endpoint trong SQL operations cho đúng project trước khi chạy. SQL operations có thể chạy lại; giữ nguyên secret và thay lịch cũ theo tên job. Operations đã được ghi trong migration history cloud dưới tên `enable_attachment_cleanup_g5`, nằm ngoài thư mục migration local vì phụ thuộc pg_net/pg_cron của môi trường cloud.

## Diễn tập restore

`scripts/restore-g5-qa.ts` nhận snapshot cùng Map file theo ID. Chỉ tạo PGlite tách biệt, không nhận connection string cloud. Database giữ FK, tắt USER business trigger trong transaction để không phát sinh thông báo/lịch sử mới. Giữ UUID, timestamp; thay Auth bằng danh tính QA tổng hợp cùng UUID. Kiểm tra Owner invariant, role mapping, manifest và SHA-256/byte count từng binary.

Nguồn local: workspace QA do test tạo, export API chạy trên PGlite và bytes đi qua Edge handler với Storage adapter giả lập. Nguồn cloud: export workspace QA riêng cộng binary tải thật từ private Supabase Storage qua signed URL. Đích: PGlite riêng và thư mục `output/playwright/g5-restore` theo UUID path. Kiểm tra file thiếu/hỏng bị từ chối; identity sequences được điều chỉnh sau khi nhập lịch sử. Không khôi phục managed Supabase Auth/Storage, không phải PITR và không phải UI import.

Backup đầy đủ khi vận hành cần: dump database phù hợp, bản sao object Storage có manifest/hash, cấu hình/migrations và kế hoạch khôi phục danh tính Auth riêng. Product JSON tự nó không đủ khôi phục hệ thống. Không đưa credentials vào export hay Git.

## Giới hạn cần nhớ

- File chưa xác nhận giữ quota đến khi retry thành công hoặc GC dọn. Đóng trang mất File object để retry; mở lại kiểm tra danh sách trước khi tải mới.
- Không hỗ trợ preview, antivirus, resumable upload, import UI, backup/PITR dịch vụ.
- CORS chỉ cho localhost/127.0.0.1 các port 5173/5180/5190; thêm origin chính xác khi thay môi trường.
- Cần quan sát cron/job errors; lease/retry không thay thế giám sát vận hành.
