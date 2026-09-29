# Kết quả kiểm chứng — 2026-09-29

- Production build (bao gồm vue-tsc): đạt.
- Vitest: 7/7 test đạt, bao gồm chuyển cột theo cả hai thứ tự event, không mất/nhân đôi task, storage hỏng và quota lỗi.
- Prettier: đạt.
- npm audit sau cập nhật dependency: 0 vulnerabilities tại thời điểm kiểm tra.
- Trình duyệt desktop 1440px: tạo task, chặn tiêu đề khoảng trắng, sửa, Hủy giữ dữ liệu gốc, chuyển trạng thái, tìm kiếm, xóa có xác nhận.
- Kéo thực tế một thẻ giữa hai cột; reload xác nhận task vẫn ở cột đích.
- Mobile 390px: form vừa màn hình, tạo và xóa task thử hoạt động; document không tràn ngang.
- Route hướng dẫn hoạt động. Các task kiểm thử đã được xóa, dữ liệu mẫu còn lại.
- Build có cảnh báo annotation comment của dependency Zod; không làm build thất bại.

Chưa kiểm chứng: kéo cảm ứng trên thiết bị thật, đa tab, backend, auth, RLS, realtime. Những tính năng backend chưa được triển khai.
