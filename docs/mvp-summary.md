# Tổng kết MVP — 2026-10-01

Phạm vi: frontend dev local + Supabase cloud; chưa deploy. Các module Auth, Workspace, Board/Task, Collab và Sync đã triển khai. Đợt này đã chạy ba tài khoản thật, sửa lỗi conflict gây timeout và bổ sung suite E2E tự động.

## Checklist

- [x] E2E local: 10/10, SQL/unit: 125/125.
- [x] Cloud Owner/Member/Viewer; người ngoài dùng tài khoản Viewer trước khi mời; RPC/RLS, đổi role/gỡ thành viên và subscription sau thu hồi.
- [x] Cloud concurrent edit/reorder, response bị mất sau commit + exact receipt retry, reconnect giữ draft.
- [x] Benchmark 100 task, 5 phiên; số liệu chi tiết trong báo cáo.
- [x] Responsive 390/768/1440, Axe, keyboard/focus/Escape và các trạng thái lỗi qua E2E.
- [ ] Email đăng ký/xác minh/reset từ inbox thật và auth redirect; chỉ có login verified/UI routes được kiểm tra.
- [ ] Cảm ứng thiết bị thật/screen reader.
- [x] Cloud realtime comment qua UI nhiều tài khoản, giữ draft/focus và accessibility tree (lượt bổ sung ngày 2026-10-01).
- [x] Báo cáo chỉ rõ kết quả và giới hạn, không coi mock là cloud.

**Chưa chốt M3 100%** vì các kiểm tra thủ công còn mở. Không cần thêm tính năng hoặc deploy để thực hiện các kiểm tra này.

Xem [báo cáo nghiệm thu và lệnh chạy](mvp-verification.md), [yêu cầu/ma trận quyền](requirements.md), [Collab](collab.md), [Sync](sync.md).

G0 v1 hoàn thành đặc tả ngày 2026-10-02: [quyết định sản phẩm và thiết kế G1](product-v1-spec.md). Cập nhật 2026-10-03: G1–G3 đã triển khai; xem [nghiệm thu G1](g1-verification.md), [G2](g2-verification.md) và [G3](g3-verification.md). Checklist MVP và số liệu ngày 2026-10-01 ở trên giữ nguyên như bằng chứng lịch sử.
