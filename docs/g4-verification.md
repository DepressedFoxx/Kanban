# G4 — Thông báo trong app và theo dõi task

Triển khai và áp dụng migration cloud ngày 2026-10-05 (Asia/Bangkok), sau xác nhận của người dùng. **1 E2E cloud G4 đạt**, bao gồm realtime hai phiên, read sync, retry, lời mời và thu hồi quyền. Một mẫu giao việc đến khi cả hai UI hiển thị đo được 1.911 ms, gồm RPC; không thay thế benchmark.

Migration: `supabase/migrations/20261003025156_notification_center_g4.sql` (file tạo bằng CLI ngày 2026-10-03, hoàn thiện ngày 2026-10-05). Cần toàn bộ migrations G1–G3 trước đó. Không xóa dữ liệu hiện có, không có deployment hoặc gửi email.

## Cách dùng

- Mở **Thông báo** trong sidebar/drawer, route `/notifications`. Badge hiển thị số chưa đọc, rút gọn 99+ nhưng tên truy cập giữ số thật.
- Chọn tất cả/chưa đọc; đánh dấu từng mục hoặc tất cả đã đọc. Mở task hoặc danh sách board của workspace bằng link trong thông báo.
- Phân trang 20 mục với nút mới hơn/cũ hơn; dữ liệu được đọc lại khi quay trang, không giữ cache nội dung trang cũ.
- Trong task đang hoạt động, chọn **Theo dõi task/Bỏ theo dõi task**. Owner/Member/Viewer đều có thể thay đổi lựa chọn cá nhân này.
- Mở **Tùy chọn thông báo** để bật/tắt giao việc, bình luận và lời mời; nhấn Lưu. Tùy chọn chỉ ảnh hưởng sự kiện mới, không xóa lịch sử.
- Lời mời hiển thị tên workspace và vai trò trước khi xác nhận tham gia. Không tự tham gia, không lộ token lời mời.

## Quy tắc sản phẩm

| Sự kiện       | Người nhận              | Điều kiện                                                                                                                 |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Giao việc     | Assignee mới            | Còn membership, tài khoản verified, task/board/workspace hoạt động; không tự thông báo cho người thao tác                 |
| Bình luận mới | Người theo dõi          | Assignee mặc định theo dõi nếu chưa có lựa chọn riêng; override bật/tắt ưu tiên hơn mặc định; không thông báo cho tác giả |
| Lời mời       | Tài khoản có email khớp | Email trong Auth đã xác minh tại thời điểm tạo lời mời; dùng email server, không dùng user_metadata                       |

Override theo dõi còn hiệu lực khi assignee đổi. Nếu muốn quay lại theo dõi, người dùng bật lại rõ ràng; chưa có nút xóa override để trở về chế độ tự động. Rời/bị gỡ workspace xóa override, assignment được xử lý bởi cơ chế hiện có.

Không backfill sự kiện trước migration hoặc lời mời tạo lúc người nhận chưa có tài khoản verified. Trường hợp đó tiếp tục dùng link mời hiện có. Tắt một loại thông báo không nhận bù các sự kiện trong khoảng đã tắt.

Hạn chế nhiễu bằng loại trừ chính người thao tác, chỉ gửi comment tới người theo dõi, cho tắt theo task/loại sự kiện, và không tạo toast/âm thanh/email/push cho từng sự kiện. Chưa gộp nhiều comment thành một mục hoặc có rate limit/retention tự động.

## Quyền, API và đồng bộ

Nội dung thông báo nằm trong schema `workspace_internal`, không cấp SELECT/write cho client. Mỗi `notification_feed` kiểm tra auth.uid(), email verified, membership và trạng thái archive mới nhất. Không lưu bản sao tiêu đề/comment body trong thông báo: trả tên task/workspace hiện tại khi còn quyền. Comment đã xóa và invitation đã nhận/thu hồi/hết hạn không được trả về.

`public.notification_signals` chỉ chứa user_id và revision; RLS cho đọc dòng của mình, không cấp ghi trực tiếp. Realtime chỉ phát tín hiệu thay đổi riêng theo user, client gọi feed để đọc lại dữ liệu có kiểm tra quyền. App cũng nghe thay đổi board/workspace; xóa comment, nhận/thu hồi lời mời và gỡ membership tăng tín hiệu cho người liên quan. Hết hạn theo thời gian được phát hiện khi tải lại/fallback 30 giây lúc tab hiển thị, hoặc focus/reconnect.

API:

- `notification_feed(p_before bigint?, p_unread boolean=false, p_limit integer=20)`: keyset theo ID giảm dần, tối đa 50 mục/request, unread count, high_water, next cursor và preferences riêng. ID bigint được trả dạng chuỗi để không mất độ chính xác JavaScript.
- `notification_mutate(p_mutation uuid,p_action text,p_data jsonb)`: read, read_all, preferences, watch. Server quyết định user, không nhận recipient tùy ý. Read/preferences/watch có version; stale trả PT409. Receipt theo user + mutation ID chống thực thi lại. Read-all chỉ tác động ID đến high_water của danh sách đã tải, không vô tình đọc sự kiện mới hơn.
- `task_watch_get(p_task uuid)`: trả enabled/version/automatic, yêu cầu quyền xem task đang hoạt động.
- `notification_invitation_accept(p_invitation uuid)`: chỉ email verified đúng người nhận; kiểm tra expiry/revocation/archive tại thời điểm ghi, khóa workspace rồi invitation. Nhận lại cùng lời mời trả workspace khi vẫn là thành viên, không ghi membership/audit lần hai. ID invitation không thay thế kiểm tra danh tính.

Trigger tạo sự kiện trong cùng transaction nghiệp vụ. Rollback không để lại thông báo. Unique (recipient,event_key) chống trùng cho comment/invitation; assignment chỉ tạo khi assignee thực sự thay đổi, board receipt chặn retry nghiệp vụ. Các helper/trigger private bị thu hồi EXECUTE của public/anon/authenticated.

Store vô hiệu hóa response cũ khi đổi trang/logout; lỗi đọc xóa nội dung cache. Ghi chưa rõ kết quả giữ nguyên request để retry và khóa ghi mới. Banner retry tồn tại ở app shell khi đổi route. ACK thành công nhưng reload lỗi vẫn phân biệt đã cập nhật với lỗi tải dữ liệu. Việc đổi trang không tự đánh dấu đã đọc.

## Kiểm thử đã chạy

- **167 tests / 21 files đạt** sau bổ sung G4; **21 E2E local đạt**.
- 6 SQL tests G4: assignment/comment, self-exclusion, receipt/rollback sau trigger, private payload và RLS signals, assignee default/opt-out/Viewer, preference mute, read conflict và high-water, mất membership/archive/comment deletion, email invitation/accept retry/expiry/revoke, pagination có sự kiện mới và input sai.
- 5 store tests G4: response cũ/logout, fail-closed refresh, detached retry payload, invitation retry, conflict, ACK thành công nhưng reload lỗi.
- 2 E2E G4: mobile 390px, read retry không tăng version hai lần, preferences, task watch, mất quyền; invitation preview/cancel/accept retry. Axe WCAG A/AA không ghi nhận vi phạm ở màn hình đã quét; không overflow ngang.
- Production build, typecheck source, typecheck E2E và format check đạt. Build còn cảnh báo chunk chính trên 500 kB và annotation Zod như baseline.
- Một test draft board cũ có race với initial collab refresh: cập nhật mock server cùng remote snapshot để callback định kỳ không trả phiên bản giả cũ. Giữ nguyên assertion kiểm tra bảo vệ draft.
- Ảnh: `output/playwright/g4-notifications-mobile.png` (ignored).

Lệnh chạy lại:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck:e2e
npm.cmd run test:e2e
npm.cmd run format:check
```

## Cloud và các phần chưa nghiệm thu

- [x] Người dùng cho phép áp dụng migration G4 trên Supabase hiện tại.
- [x] Áp dụng migration; chạy security advisor sau thay đổi.
- [x] Chạy `npm.cmd run test:e2e:cloud -- e2e-cloud/notifications.spec.ts`: hai phiên Member nhận giao việc/comment, đồng bộ đã đọc, lost-response retry, outsider denial, opt-out, invitation và mất quyền realtime. Test dùng workspace QA riêng và giữ nguyên preferences đang có; cần tài khoản QA bật loại thông báo tương ứng.
- [x] Ghi kết quả `output/playwright/g4-cloud-verification.json`; gỡ memberships và archive workspace QA sau test.
- [ ] Narrator/NVDA và thiết bị cảm ứng thật; benchmark nhiều workspace/nhiều phiên; kiểm thử UI mọi tổ hợp preference/cursor và mất mạng.

Advisor sau G4: RLS không policy tăng từ 6 lên 10 do bốn bảng internal mới không cấp quyền client; RPC SECURITY DEFINER callable tăng từ 24 lên 28 do bốn API có kiểm tra quyền. Đã xác minh RLS bật trên cả năm bảng mới, bảng internal không cấp SELECT/INSERT và signals chỉ cấp SELECT; signals đã vào publication. Cảnh báo leaked-password protection có từ trước vẫn còn, không thay cấu hình Auth trong lượt này. Tham khảo [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [RPC audit](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Thông báo đã tải có thể còn trên màn hình đến lần refresh tiếp theo; không hứa xóa dữ liệu đã xem khỏi thiết bị. Mọi request mới và link đích kiểm tra quyền lại. Logout/reload không lưu receipt chưa xác nhận xuống disk: nếu đóng trình duyệt giữa request, tải lại để kiểm tra trạng thái trước khi thao tác mới.
