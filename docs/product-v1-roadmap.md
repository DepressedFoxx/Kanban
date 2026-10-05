# Kế hoạch phát triển Kanban v1

Ngày lập: 2026-10-02; cập nhật: 2026-10-05 (Asia/Bangkok). G0 đã chốt đặc tả; G1–G3 đã triển khai và kiểm thử các luồng chính trên local/cloud. G4 đã áp dụng migration và đạt E2E cloud ngày 2026-10-05. Bằng chứng và giới hạn nằm trong [G1](g1-verification.md), [G2](g2-verification.md), [G3](g3-verification.md) và [G4](g4-verification.md). G5 đã triển khai và kiểm thử cloud, xem [G5](g5-verification.md); G6 đang nghiệm thu, xem [bằng chứng G6](g6-verification.md). Xem [đặc tả v1](product-v1-spec.md). Checkbox triển khai và checkbox nghiệm thu được theo dõi riêng.

## 1. Mục tiêu và phạm vi

Xây dựng ứng dụng quản lý công việc dùng hằng ngày cho cá nhân và nhóm nhỏ: vào workspace, nhận việc, thực hiện, trao đổi, theo dõi tiến độ và quản lý dữ liệu. “Hoàn chỉnh” được đánh giá theo luồng sử dụng và độ tin cậy trong phạm vi v1, không theo số lượng tính năng.

- Tiếp tục frontend dev local và Supabase hiện có; deployment public là mốc riêng.
- Giữ Vue 3 Composition API, Pinia, Vue Router, TailwindCSS và hệ thống UI hiện tại.
- Tiếp tục Owner/Member/Viewer; Viewer chỉ đọc.
- Lời mời bằng link vẫn là luồng chính. Không bắt buộc dịch vụ gửi email mời/thông báo cho v1.
- Email xác minh và khôi phục tài khoản vẫn cần nghiệm thu với cấu hình Auth thực tế.
- Mỗi giai đoạn hoàn thành UI, quyền server, dữ liệu, sync, kiểm thử và tài liệu trước khi chuyển giai đoạn.

## 2. Điểm xuất phát

Đã triển khai Auth, Workspace, Board/Task, bình luận/lịch sử, realtime, version conflict, receipt chống ghi trùng, bảo vệ draft và E2E. Bằng chứng các lượt trước nằm trong [báo cáo MVP](mvp-verification.md), [tổng kết MVP](mvp-summary.md), [Collab](collab.md) và [Sync](sync.md).

Lượt cloud sau báo cáo ban đầu đã kiểm tra comment qua UI hai chiều Owner/Member, Viewer nhận comment, giữ draft/focus và accessibility tree. Ghi chú “chưa test realtime comment” trong tài liệu cũ cần được đồng bộ ở G0. Accessibility tree không thay thế kiểm thử Narrator/NVDA thực tế.

Kết quả lịch sử 125 tests, 10 E2E local và benchmark 100 task/5 phiên là baseline; không được dùng để khẳng định các tính năng mới đã đạt. Kế hoạch này không chạy lại kiểm thử.

## 3. Thứ tự triển khai

| Mốc | Kết quả bàn giao                                  | Phụ thuộc    | Điều kiện chuyển mốc                             |
| --- | ------------------------------------------------- | ------------ | ------------------------------------------------ |
| G0  | Đặc tả v1, ma trận quyền và baseline nhất quán    | MVP hiện tại | Các quyết định nghiệp vụ được ghi rõ             |
| G1  | Account/Workspace Settings và vòng đời thành viên | G0           | Rời nhóm/chuyển Owner/archive an toàn            |
| G2  | Labels, checklist và thao tác task/comment        | G1           | Quyền, retry, conflict, lịch sử và UI đạt        |
| G3  | My Tasks, lọc/sắp xếp và saved filters            | G2           | Kết quả đúng quyền, ngày và deep link            |
| G4  | Notification Center và theo dõi task              | G2–G3        | Không trùng, không lộ thông tin khi mất quyền    |
| G5  | Attachment, export và quy trình khôi phục         | G1–G4        | File có quyền, dữ liệu có thể kiểm tra/khôi phục |
| G6  | Nghiệm thu v1 trên local                          | G1–G5        | Toàn bộ điều kiện phát hành v1 trong phạm vi đạt |

Chưa cam kết thời gian khi chưa phân tích schema và màn hình cho từng mốc. Ước lượng sau G0 theo từng lát cắt chức năng, bao gồm migration, kiểm thử và xử lý lỗi; không chỉ tính thời gian dựng UI.

## 4. G0 — Chốt đặc tả và baseline

- [x] Đồng bộ trạng thái thực tế giữa requirements, README và báo cáo MVP; giữ rõ ngày/môi trường của bằng chứng cũ.
- [x] Kiểm tra code/schema hiện tại trước khi đề xuất bảng, index hoặc refactor.
- [x] Viết ma trận quyền cho settings, chuyển Owner, rời nhóm, archive, labels, checklist, comment và attachment.
- [x] Chốt quy tắc ngày hạn: ngày theo lịch hay thời điểm; timezone nào dùng để xác định quá hạn.
- [x] Chốt chính sách archive và dữ liệu của thành viên rời workspace.
- [x] Chốt giới hạn file, cách xử lý comment đã sửa/xóa và schema export.
- [x] Ghi rõ các tình huống lỗi và tiêu chí nghiệm thu trước mỗi tính năng.

### Tóm tắt quyền — chi tiết và ngoại lệ trong product-v1-spec.md

| Hành động                              | Owner                 | Member                | Viewer |
| -------------------------------------- | --------------------- | --------------------- | ------ |
| Xem nội dung workspace đang có quyền   | Có                    | Có                    | Có     |
| Sửa settings/quản lý thành viên        | Có                    | Không                 | Không  |
| Chuyển Owner/archive/restore workspace | Có                    | Không                 | Không  |
| Rời workspace                          | Sau khi chuyển Owner  | Có                    | Có     |
| Tạo/sửa task, checklist, gắn nhãn      | Có                    | Có                    | Không  |
| Quản lý danh mục nhãn workspace        | Có                    | Không                 | Không  |
| Thêm bình luận                         | Có                    | Có                    | Không  |
| Sửa/xóa bình luận của mình             | Có, khi còn quyền ghi | Có, khi còn quyền ghi | Không  |
| Xóa bình luận người khác để quản trị   | Có, ghi audit         | Không                 | Không  |
| Tải lên attachment                     | Có                    | Có                    | Không  |
| Tải xuống file được phép xem           | Có                    | Có                    | Có     |
| Export toàn workspace                  | Có                    | Không                 | Không  |

Workspace archive chuyển sang chỉ đọc; Owner có thể restore. Không tự mở rộng quyền của Viewer để hỗ trợ tính năng mới. Mọi quyền được kiểm tra tại server, không chỉ ẩn nút.

## 5. G1 — Account và Workspace Settings

### Công việc

- [x] Rà soát account hiện có; hoàn thiện tên hiển thị và đổi mật khẩu, không xây trùng chức năng.
- [ ] Nghiệm thu verification/recovery và auth redirect từ email thật.
- [x] Xây trang Workspace Settings: tên, mô tả và trạng thái.
- [x] Rời workspace với xác nhận tác động tới quyền và assignment.
- [x] Chuyển Owner cho thành viên hiện tại trong transaction; người được chuyển phải còn đủ điều kiện tại thời điểm ghi.
- [x] Archive/restore workspace; phản ánh trạng thái tới các phiên đang mở.
- [x] Ghi lịch sử hành động quản trị: người thực hiện, thời điểm, đối tượng và kết quả thành công.

### Nghiệm thu

- [ ] Không có tình huống workspace không còn Owner hoặc có nhiều Owner ngoài quy tắc đã chọn.
- [ ] Request đồng thời/chạy lại không chuyển quyền hai lần hoặc để dữ liệu dở dang.
- [ ] Người rời/bị gỡ mất quyền với request mới; realtime và cache xử lý mất quyền.
- [ ] Archive chặn tất cả đường ghi nghiệp vụ, bao gồm comment và các tính năng bổ sung sau này.
- [ ] Lịch sử vẫn đọc được khi tác giả không còn là thành viên.

Xóa tài khoản và xóa workspace vĩnh viễn là hạng mục riêng sau khi có chính sách retention, xử lý Owner, audit và dọn file. G1 ưu tiên vòng đời archive/restore.

## 6. G2 — Labels, checklist và task/comment

### Công việc

- [x] Danh mục nhãn workspace: tên/màu; task có thể gắn nhiều nhãn. Nhãn có chữ, không chỉ phân biệt bằng màu.
- [x] Checklist: thêm/sửa/tick/sắp xếp/xóa mục và hiển thị tiến độ.
- [x] Nhân bản task với phạm vi sao chép rõ; mặc định không sao chép comment, activity hoặc attachment.
- [x] Thao tác hàng loạt ban đầu: đổi trạng thái và archive; xác nhận số lượng và quy tắc toàn bộ thành công hoặc kết quả từng mục.
- [x] Sửa/xóa comment theo ma trận; có dấu đã sửa và quy tắc lưu dấu vết khi xóa.
- [x] Thiết kế version/receipt cho dữ liệu mới dựa trên cơ chế hiện có; không ghi đè thay đổi người khác một cách im lặng.

### Nghiệm thu

- [x] Hai mutation checklist cùng version cho một thành công/một PT409; UI giữ draft khi conflict.
- [ ] Bổ sung ca concurrent reorder checklist riêng.
- [x] Receipt SQL và retry UI checklist/comment không tạo bản ghi trùng trong các ca đã kiểm thử.
- [x] Viewer bị chặn ghi G2 trong SQL/cloud đã kiểm thử.
- [ ] Bổ sung ma trận outsider cho từng action G2 qua RPC trực tiếp.
- [x] Xóa nhãn không làm hỏng task; task nhân bản có ID và lịch sử riêng.
- [ ] Nghiệm thu toàn bộ thêm/sửa/tick/reorder/xóa checklist chỉ bằng bàn phím; đã có nút Lên/Xuống và axe mobile đạt.

## 7. G3 — My Tasks và tìm/lọc

- [x] Trang My Tasks: việc của tôi, quá hạn, hôm nay/sắp tới, đã hoàn thành.
- [x] Filter theo workspace, board, status, priority, label và ngày hạn; sắp xếp có quy tắc ổn định.
- [x] Lưu bộ lọc theo người dùng; v1 chưa cần chia sẻ filter.
- [x] Search tiêu đề/mô tả dạng chuỗi con không phân biệt hoa/thường, trong phạm vi được quyền xem.
- [x] Pagination cho danh sách tổng hợp; không áp dụng máy móc pagination cho board kéo thả.
- [x] Empty/error/loading và link đến task vẫn có ngữ cảnh để quay lại.

Nghiệm thu: bộ lọc kết hợp đúng, không lộ dữ liệu workspace đã mất quyền, ngày quá hạn nhất quán, archived không xuất hiện sai phạm vi; thay đổi assignee/status phản ánh vào danh sách.

Bằng chứng SQL, store, browser local/cloud và giới hạn còn lại: [G3](g3-verification.md). Không coi kiểm tra axe là nghiệm thu screen reader thực tế.

## 8. G4 — Notification Center

- [x] Theo dõi/bỏ theo dõi task; assignee mặc định theo dõi nếu chưa có override.
- [x] Thông báo giao việc/comment; lời mời khớp email tài khoản đã verified tại thời điểm tạo.
- [x] Đọc/chưa đọc, đọc tất cả, phân trang và liên kết task/workspace.
- [x] Tùy chọn nhận trong app, không gửi email.
- [x] Trigger cùng transaction và khóa chống trùng; SQL local đã kiểm tra rollback/retry.
- [x] Loại chính người thao tác, opt-out theo task/loại; không toast/email/push từng sự kiện.
- [x] Áp dụng migration và nghiệm thu cloud hai phiên, cập nhật advisor; xem [báo cáo G4](g4-verification.md).

Nghiệm thu: retry không sinh thông báo trùng; danh tính người nhận do server quyết định; mất quyền thì nội dung cũ/link không làm lộ dữ liệu; đánh dấu đã đọc đồng bộ giữa các phiên. Mention để sau v1, không đưa thêm cú pháp và quyền mention vào mốc này.

## 9. G5 — Attachment và dữ liệu

### Attachment

- [x] Chốt loại file, kích thước tối đa và quota; kiểm tra phía server/storage.
- [x] File private theo quyền task/workspace, tên lưu không phụ thuộc trực tiếp tên người dùng nhập.
- [x] Upload có trạng thái và retry; metadata chỉ phản ánh file đã được xác nhận.
- [x] Xóa/thu hồi file theo quyền; xử lý file mồ côi khi upload hoặc ghi metadata thất bại.
- [x] Thiết kế thời hạn URL tải, cache và giới hạn thu hồi đối với URL đã cấp; ghi rõ giới hạn thay vì hứa thu hồi tức thời.

### Export và khôi phục

- [x] Owner export dữ liệu theo schema có phiên bản, không chứa credentials/token hoặc dữ liệu workspace khác.
- [x] Quy định rõ file attachment có nằm trong export hay chỉ có metadata.
- [x] Tách export sản phẩm khỏi backup database/Auth/Storage.
- [x] Viết và thử quy trình khôi phục trên dữ liệu QA riêng; xác minh liên kết task/comment/file và quyền sau khôi phục.

Nghiệm thu: lỗi giữa upload/metadata có đường phục hồi; người ngoài không tải file dù biết ID; export đầy đủ theo phạm vi công bố; bằng chứng restore ghi rõ nguồn, đích và các dữ liệu không được bao gồm.

## 10. G6 — Chất lượng và nghiệm thu v1

- [ ] Rà soát luồng vào workspace → nhận việc → checklist/comment → hoàn thành → theo dõi và quản lý dữ liệu.
- [ ] E2E nhiều tài khoản gồm quyền trực tiếp, role changes, archive, concurrent writes, retry và reconnect cho các module mới.
- [ ] Test keyboard/focus/Escape, axe và trạng thái động; thử Narrator/NVDA thực tế và thiết bị cảm ứng khi có phương tiện kiểm chứng.
- [ ] Nghiệm thu email recovery/verification thật; không coi mock là bằng chứng inbox.
- [x] Đo lại baseline 100 task/5 phiên: 25 mẫu, 855–1943ms, tất cả dưới 2 giây; xem G6.
- [ ] Đo route tải đầu, bundle, truy vấn và board lớn trước khi chọn code splitting/index/virtualization. Ghi ngân sách hiệu năng đã thống nhất trước khi tối ưu.
- [ ] Kiểm tra lỗi có thông điệp, đường retry và dữ liệu chẩn đoán phù hợp; không log password/token/nội dung riêng không cần thiết.
- [ ] Build, typecheck, format và bộ kiểm thử liên quan đạt; credentials không nằm trong Git/bundle.
- [ ] README/setup/migration/checklist khớp phiên bản cuối; giới hạn còn lại được công bố.

Không đánh dấu toàn bộ v1 đạt khi kiểm tra bắt buộc còn thiếu bằng chứng. GitHub CI remote, hosting và URL production không phải điều kiện của phiên bản dev local.

## 11. Nguyên tắc kiến trúc và cấu hình

| Loại cấu hình | Ví dụ                                        | Nơi quản lý                                      |
| ------------- | -------------------------------------------- | ------------------------------------------------ |
| Ứng dụng      | Route, timeout, giới hạn nhập, design tokens | Module cấu hình có kiểu dữ liệu trong source     |
| Người dùng    | Theme, hiển thị, notification preferences    | Hồ sơ/tùy chọn người dùng; local khi có chủ đích |
| Workspace     | Tên, mô tả, trạng thái                       | Database, quyền server và sync                   |

- Không tạo một settings file/store chứa tất cả trách nhiệm.
- Giữ feature-based structure hiện tại; tách module khi có trách nhiệm rõ, không refactor toàn bộ cùng lúc với migration quyền.
- Backend là nguồn quyết định quyền và dữ liệu hợp lệ; config frontend phục vụ phản hồi sớm.
- Migration tiến về phía trước, giữ dữ liệu cũ; kiểm tra schema/index thực tế trước khi thêm bảng hoặc index.
- Không chuyển sang backend riêng khi chưa có nhu cầu được đo hoặc giới hạn cụ thể.
- Mọi feature có trạng thái loading/empty/error/denied/readonly và cách xử lý request chưa rõ kết quả.
- Tiếp tục các commit độc lập theo thay đổi có ý nghĩa; kèm description và kiểm chứng. File code/test/migration phụ thuộc nhau phải tạo được trạng thái nhất quán ở mỗi commit.

## 12. Sau v1 và điều kiện xem xét

| Hạng mục                            | Khi nào xem xét                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Admin/Guest                         | Có workflow thực tế không biểu diễn được bằng ba role hiện tại                                      |
| Board riêng tư/membership riêng     | Cần cách ly dữ liệu trong cùng workspace và đã thiết kế lại quyền xuyên module                      |
| Cột tùy biến/WIP                    | Có nhu cầu workflow vượt bốn trạng thái hiện tại                                                    |
| Nhiều assignee/dependency/recurring | Có tình huống sử dụng cụ thể và quy tắc rõ                                                          |
| Presence                            | Cần biết người đang xem/làm việc; không dùng thay cho xác nhận đã lưu                               |
| Calendar/timeline/automation        | Sau khi task/date/event ổn định và người dùng cần góc nhìn bổ sung                                  |
| Billing/SSO/mobile app/API public   | Có mục tiêu thương mại hoặc tích hợp cụ thể                                                         |
| Deployment/staging/CI remote        | Người dùng quyết định triển khai; lúc đó chốt môi trường, backup, monitoring và quy trình migration |

## 13. Điểm bắt đầu của lượt triển khai tiếp theo

G5 đã triển khai attachment, export và diễn tập restore QA; xem [bằng chứng và giới hạn](g5-verification.md). G6 đang nghiệm thu: 21 E2E local, 6 E2E cloud đạt; đã áp dụng quyền Member tạo board. Xem [G6](g6-verification.md) và các mục còn mở. Tiếp tục theo dõi các ca còn mở trong báo cáo G1–G4; chưa chốt nghiệm thu toàn bộ v1. Không bắt đầu đồng thời tất cả các mốc.
