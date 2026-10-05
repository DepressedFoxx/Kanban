# G6 — Nghiệm thu v1 trên local

Ngày: 2026-10-05. Frontend dev local, Supabase cloud hiện có. **Chưa đóng toàn bộ G6/v1**: các mục cần thiết bị thật, email verification và một số ca chuyên sâu bên dưới vẫn mở. Không yêu cầu deploy public.

## Kết quả lượt nghiệm thu

- Build, typecheck E2E và format đạt; baseline 177 SQL/unit/component tests đạt; sau sửa quyền Member, toàn suite 178 tests đạt, bổ sung restore regression đạt riêng (8/8 settings tests).
- E2E local: **21/21 đạt trong một lượt đầy đủ**, gồm luồng tạo task/comment, retry mất response, timeout/offline, conflict, thu hồi quyền, drawer focus/Escape, axe ở 390/768/1440px, G2–G4.
- E2E cloud: **6/6 đạt**, chạy tuần tự trên workspace QA riêng: settings, task productivity, My Tasks, notifications, attachments/export/restore và benchmark. Không dùng mock để kết luận cloud.
- Recovery: đã gửi yêu cầu email thật từ form local; **người dùng xác nhận mở email và cập nhật mật khẩu mới thành công**. Đây là xác nhận của người dùng, không phải bằng chứng agent đọc inbox. Credential test cập nhật riêng trong file ignored; không đưa vào tài liệu/Git.
- Kiểm tra tĩnh: không thấy file env thật được Git track, không thấy mẫu secret key/private-key được kiểm tra trong source đã track/bundle. Đây là kiểm tra mẫu giới hạn, không phải chứng nhận không có mọi loại secret.

## Hiệu năng đo được

100 task, 5 phiên Chromium độc lập (Owner/Member/Viewer/Owner/Member), 5 lần cập nhật = **25 mẫu**. Thời gian từ trước request mutation tới khi tên task mới xuất hiện trong từng phiên, gồm độ trễ mạng/API/realtime/render. Chạy cùng lúc suite local trên máy dev nên không đại diện thiết bị production.

| Chỉ số             |   ms |
| ------------------ | ---: |
| Min                |  855 |
| Median             |  997 |
| P95 (nearest rank) | 1456 |
| Max                | 1943 |
| Ngân sách đã chốt  | 2000 |

Tất cả mẫu đạt. `scripts/check-g6-realtime.mjs` làm gate: yêu cầu run hoàn tất, report mới trong 24 giờ, đủ 5×5 mẫu và từng mẫu >0, ≤2000ms. Không chỉ ghi boolean rồi vẫn báo test pass. Report gốc: `output/playwright/cloud-verification.json` (ignored).

Build baseline: entry JS **652525 bytes / gzip 203479**, chunk TaskCard **184254 / gzip 64680**, OnlineBoardView **57775 / gzip 16075**, CSS **47374 / gzip 9737**. `scripts/audit-g6.mjs` ghi kích thước có thể tái lập vào `output/playwright/g6-static-audit.json`. Đây không phải thời gian tải route. Chưa chốt ngân sách tải đầu/bundle hoặc đo cold route/query plan trên dataset lớn, nên chưa tự thêm index/virtualization hay tăng ngưỡng cảnh báo 500kB. Cảnh báo annotation Zod còn tồn tại.

## Sửa chênh lệch đặc tả

Người dùng phê duyệt rõ quyền Member tạo board trong G6. Migration `20261005085459_member_board_creation_g6.sql` thay guard trong hàm internal; wrapper public vẫn khoá workspace và chặn archive. Owner/Member được tạo, Viewer/outsider bị chặn; retry cùng UUID/actor/name không tạo trùng. Không thay quyền rename/archive hay cấp quyền gọi internal cho client.

Migration đã áp dụng cloud. SQL local kiểm tra tạo/retry, Viewer denied, Member bị hạ role không retry bypass, archive denied. UI dùng role hiện tại để hiển thị form. Cloud regression mới kiểm tra Member create/retry + form và Viewer denied; đã đạt 1/1 cloud regression với mật khẩu QA mới. Kiểm tra grants cloud: authenticated không được gọi internal, anon không được gọi public board_create.

## Các mục còn mở — không đánh dấu đạt

- Email xác minh đăng ký thật; recovery link hết hạn/đã dùng cần bằng chứng riêng. Đăng nhập lại bằng credential mới đã qua cloud regression.
- Narrator/NVDA đọc thật; thao tác cảm ứng trên thiết bị thật. Axe/viewport emulation không thay thế hai mục này.
- Race transfer-vs-remove, hai transfer và các biến thể archive-vs-task write trên cloud. Restore giữ board archive đã có SQL regression đạt; archive-vs-comment đã đạt cloud (1/1 regression). Các test đã có không bao trùm mọi interleaving.
- Thu hồi quyền trên mọi tab/settings/task và toàn bộ điểm rollback/fault injection còn thiếu như báo cáo G1; không suy rộng một ca đạt thành tất cả tổ hợp.
- Cold route production, số lượng/thời gian query và My Tasks pagination dataset lớn; ngân sách cần chốt trước tối ưu.
- Các vấn đề UX riêng trong báo cáo Shiro chưa xử lý toàn bộ; sửa spacing/màu không đồng nghĩa hoàn tất R1–R9.

## Checklist thủ công

1. Dùng tài khoản QA nhận email xác minh mới: ghi giờ nhận, mở link trên đúng origin local, đăng nhập và xác nhận màn hình tài khoản. Không lưu token/link đầy đủ vào report.
2. Recovery: sau đổi mật khẩu, đăng nhập lại; mở lại link đã dùng và link hết hạn phải có thông báo/đường yêu cầu link mới, không cho đổi mật khẩu ngoài phiên recovery.
3. Narrator/NVDA: vào board, mở task bằng bàn phím, kiểm tra tên dialog, focus ban đầu, các nhãn, thông báo save/error/realtime; Escape và focus trở về trigger. Ghi phiên bản reader/browser và kết quả phát âm thực tế.
4. Thiết bị cảm ứng thật: drawer, select, date, bàn phím ảo, cuộn dialog và chuyển trạng thái task. Ghi model/OS/browser; không coi giả lập viewport là thiết bị thật.

## Lệnh tái lập

```powershell
npm.cmd run build
npm.cmd run typecheck:e2e
npm.cmd run format:check
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:e2e:cloud
node scripts/audit-g6.mjs
node scripts/check-g6-realtime.mjs
```

Cloud test đọc tài khoản QA từ `.env.e2e.local` ignored, tạo dữ liệu riêng và giữ dữ liệu QA ở trạng thái archive để kiểm tra. Không dùng tài khoản hoặc workspace thật của người dùng làm dữ liệu test.

## Security advisor sau migration G6

Không tăng so với G5: 12 INFO RLS/no-policy, 30 WARN authenticated SECURITY DEFINER và 1 WARN leaked-password protection. Không coi advisor sạch. Các hàm public có guard; internal không cấp EXECUTE cho client. Tham khảo [SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS/no-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
