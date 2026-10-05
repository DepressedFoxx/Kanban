# G2 — Nhãn, checklist và thao tác task/comment

Cập nhật tài liệu: 2026-10-03 (Asia/Bangkok). G2 đã triển khai; migration đã áp dụng trên Supabase sau khi người dùng xác nhận. Bằng chứng bên dưới là kết quả lượt triển khai G2, không phải lần chạy lại khi cập nhật docs.

## Cách sử dụng

1. Mở board online, mở **Quản lý nhãn** dưới bộ lọc. Owner tạo/sửa/xóa nhãn dùng chung cho workspace; xóa nhãn gỡ liên kết khỏi task, giữ nguyên task.
2. Mở task đã lưu để chọn nhãn, thêm/sửa/tick/xóa checklist và đổi thứ tự bằng nút Lên/Xuống. Bấm **Lưu nhãn và checklist** để lưu cả hai trong cùng transaction. Thẻ task hiển thị nhãn và tiến độ checklist.
3. Bấm **Nhân bản công việc đã lưu** khi không còn draft/conflict. Bản sao có ID mới, giữ nội dung, trạng thái, ưu tiên, assignee, ngày hạn và nhãn; checklist có ID mới và reset tick. Không sao chép comment hoặc activity cũ; bản sao có sự kiện tạo riêng. Attachment chưa triển khai.
4. Mở **Thao tác nhiều công việc**, chọn task đang hoạt động rồi đổi trạng thái hoặc lưu trữ. Dialog xác nhận số lượng. Một task không hợp lệ hoặc version cũ làm toàn bộ mutation thất bại.
5. Trong **Bình luận & lịch sử**, tác giả có thể sửa/xóa bình luận khi còn quyền ghi. Owner chỉ được sửa bình luận của mình; xóa bình luận người khác cần lý do quản trị.

## Quyền và giới hạn

| Thao tác                                      | Owner | Member | Viewer |
| --------------------------------------------- | ----- | ------ | ------ |
| Đọc nhãn/checklist/comment được phép truy cập | Có    | Có     | Có     |
| Quản lý danh mục nhãn workspace               | Có    | Không  | Không  |
| Gắn nhãn, sửa checklist, duplicate, bulk task | Có    | Có     | Không  |
| Sửa/xóa comment của mình                      | Có    | Có     | Không  |
| Xóa comment người khác, ghi lý do/audit       | Có    | Không  | Không  |

Workspace, board hoặc task archived chặn ghi nghiệp vụ tương ứng. Chuyển role hoặc mất membership được server kiểm tra lại mỗi request. Quyền tạo board vẫn chỉ Owner; quyền Member tạo board trong ma trận v1 chưa triển khai.

Giới hạn UI nằm ở `src/features/tasks/productivity.ts`; SQL kiểm tra độc lập: 100 nhãn/workspace, tên 1–40 ký tự không trùng sau trim và so không phân biệt hoa thường; 20 nhãn/task; 100 mục checklist/task, mỗi mục 1–300 ký tự; bulk 1–50 task cùng board. Comment tối đa 2.000 ký tự; lý do quản trị 1–500 ký tự.

## Database, đồng bộ và draft

Migration: `supabase/migrations/20261002063835_task_productivity_g2.sql`. Trên project hiện tại đã áp dụng; môi trường mới cần toàn bộ migrations theo thứ tự tên file, không chỉ riêng migration này.

- Thêm `workspace_labels`, `task_labels`, `task_checklist`; client được SELECT qua RLS theo membership, không được ghi trực tiếp.
- Mở rộng `board_snapshot` với danh mục nhãn, label_ids và checklist của task.
- `board_mutate` thêm label_save, label_delete, task_labels, checklist, task_details, duplicate_task, bulk_status và bulk_archive. `task_details` lưu nhãn/checklist nguyên tử. Thay đổi danh mục nhãn tăng version mọi board trong workspace để invalidation và chống ghi đè.
- Mutation board giữ receipt, khóa workspace trước board và kiểm tra version. Request cũ bị PT409; retry dùng đúng ID/payload để không ghi trùng.
- `task_comment_mutate` dùng version riêng của comment và receipt trong schema private. Thêm edited_at/deleted_at. Xóa đặt body = NULL, giữ ID/tác giả/thời điểm; API không trả body đã xóa. Không có chức năng khôi phục comment. Receipt private của lần sửa trước có thể còn payload; đây không phải cơ chế xóa sạch nội dung khỏi mọi bản lưu.
- Owner xóa comment người khác ghi audit với actor, comment/task ID và lý do; không sao chép body vào audit quản trị.
- Subscription comment nhận INSERT và UPDATE. Refresh danh sách comment đưa về trang mới nhất để không giữ nội dung sửa/xóa cũ trong các trang đã tải; người dùng có thể tải lại các trang cũ. Draft không bị thay bằng snapshot nền.
- Lưu nhãn/checklist giữ dialog và draft thông tin task. Khi conflict, đối chiếu bản hiện tại rồi chọn giữ draft hoặc bỏ draft. Kết quả mạng chưa chắc chắn khóa thao tác mới và cho retry request cũ.

## Bằng chứng kiểm thử ngày 2026-10-02

| Kiểm tra               | Kết quả đã ghi nhận                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unit/store/SQL toàn bộ | 146 tests / 17 files đạt                                                                                                            |
| SQL G2                 | 6 ca: quyền/catalog và scope, rollback/receipt, duplicate, bulk/archive, comment moderation/tombstone, checklist ID thuộc task khác |
| Store bổ sung          | Retry edit dùng payload tách khỏi draft; refresh loại trang comment cũ                                                              |
| E2E local toàn app     | 17/17 đạt ở lượt hồi quy                                                                                                            |
| E2E G2 sau sửa cuối    | 3/3 đạt: mobile + axe, checklist retry/duplicate giữ draft; bulk đổi trạng thái/archive; comment edit/conflict/delete               |
| Build và TypeScript    | Build và E2E typecheck đạt                                                                                                          |
| Cloud G2               | 1/1 đạt với ba tài khoản, database thật và hai phiên UI                                                                             |

Cloud report tại `output/playwright/g2-cloud-verification.json` (Git ignore): chạy 14:05:05–14:05:23 ngày 2026-10-02, UTC+7. Workspace QA `48a57bfc-56ce-4eda-81cd-3a2f2866971a` đã gỡ Member/Viewer và archive sau kiểm thử.

Cloud xác minh hai mutation checklist cùng version: một thành công, một PT409; Viewer bị chặn; realtime edit/delete comment giữ draft phiên khác; mất response sau edit rồi retry chỉ tăng version một lần; Owner xóa cần lý do; duplicate không mang comment; bulk và xóa nhãn giữ task.

Không suy rộng các ca này thành mọi tổ hợp quyền: outsider với từng action G2, concurrent reorder checklist riêng và toàn bộ thao tác checklist bằng bàn phím chưa có ca E2E G2 riêng. Các khoảng trống này vẫn mở trong roadmap. Benchmark 100 task/5 phiên không chạy lại ở G2. Email inbox thật, Narrator/NVDA phát âm và thiết bị cảm ứng thật vẫn chưa nghiệm thu.

## Rà soát quyền sau migration

Kiểm tra cloud đã ghi nhận: không có bảng public G2 thiếu RLS; authenticated không có USAGE schema private; anonymous không execute RPC comment mutation; task_comments có trong publication realtime.

Advisor còn 5 INFO RLS không policy (gồm bảng receipt chỉ truy cập qua RPC), 22 WARN authenticated gọi security-definer RPC có chủ ý và 1 WARN leaked password protection chưa bật. Đây không phải báo cáo không có cảnh báo. Tham khảo cách diễn giải trong [báo cáo G1](g1-verification.md).

Build còn cảnh báo chunk trên 500 kB và annotation từ Zod. Chưa đo lại ngân sách hiệu năng sau G2.

## Chạy lại

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run typecheck:e2e
npx.cmd playwright test
npx.cmd playwright test --config playwright.cloud.config.ts e2e-cloud/productivity.spec.ts
```

Cloud E2E đọc cấu hình từ các file local bị ignore theo [hướng dẫn kiểm thử](mvp-verification.md). Không đưa mật khẩu vào tài liệu/Git. Test cloud tạo workspace QA riêng và dọn membership/archive trong finally.
