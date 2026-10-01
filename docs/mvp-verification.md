# Nghiệm thu MVP local — 2026-10-01

Frontend Vite local, Chromium trên Windows, Supabase cloud thật. Ba tài khoản riêng biệt đóng vai Owner/Member/Viewer trong workspace QA mới. Viewer được kiểm tra như người ngoài trước khi nhận lời mời; không cần tài khoản thứ tư. Không sửa workspace có sẵn, không deploy.

## Kết quả

- Unit/integration SQL: 125 tests, 13 files đạt.
- E2E local: 10/10 đạt. UI chạy thật, Auth/transport giả lập, SQL PGlite chạy migration thật; realtime bị tắt có chủ đích. Không coi đây là bằng chứng cloud.
- E2E cloud: đạt; đăng nhập Supabase thật, RPC/RLS thật và năm browser context riêng biệt.
- Typecheck app/E2E và production build đạt. Build còn cảnh báo annotation Zod và chunk 633 kB; chưa tối ưu tải ban đầu.
- Axe WCAG A/AA và bàn phím tại 390/768/1440px đạt cho các màn hình được suite truy cập. Không thay thế thử screen reader và cảm ứng trên iPad thật.

## Bằng chứng cloud

- Three separate verified accounts authenticated
- Outsider before invitation cannot read RPC or direct RLS table
- Invitation preview, matching email, wrong email, repeat acceptance and revoked link
- Member cannot manage workspace; Viewer cannot write; direct table write denied
- Member task/comment writes and comment receipt with correct server actor
- Concurrent writes: one atomic success and one version conflict
- Five isolated authenticated browser sessions render 100 tasks; Viewer UI read-only
- Realtime measured with 100 tasks and 5 sessions (see measurements; includes request latency)
- Real realtime event preserves unsaved task draft and enables explicit reconciliation
- Cloud committed write with lost response retries identical receipt; task count unchanged
- Reconnect receives current state and preserves unsaved draft
- Concurrent reorder returns one conflict without lost or duplicate tasks
- Previously active Viewer subscription receives no private board event after removal; Owner control receives it
- Role downgrade blocks writes and updates UI; removed viewer loses RPC and visible data on refresh

Workspace QA cuối: `911f2121-e644-435b-ac50-f575ba9a1537`. Board: `e1f5023a-f003-462a-ac20-a3d44e0b453d`.
Kết thúc UTC: `2026-10-01T08:41:53.834Z`. Sau chạy: board được archive, thành viên thử được gỡ; workspace giữ lại để đối chiếu. Những lần thử lỗi trước cũng giữ workspace QA với tên incomplete và board archive.

## Benchmark

100 task, 5 phiên trên cùng máy/mạng, 5 lượt thay đổi, 25 mẫu. Tính từ lúc bắt đầu request ghi đến khi từng UI hiện tiêu đề mới, bao gồm độ trễ HTTP; đây là giới hạn trên bảo thủ cho commit→UI, không có đồng hồ commit server chính xác.

- Min: 827 ms; max: 1374 ms; p95 nearest-rank: 1373 ms.
- Tất cả mẫu ≤2 giây: **True**.
- Không phải kiểm thử tải nhiều thiết bị/địa lý; không dùng polling 30 giây để tính đạt.

| Lượt | 5 phiên (ms)                 |
| ---- | ---------------------------- |
| 1    | 842, 841, 840, 842, 1357     |
| 2    | 1371, 1371, 1371, 1373, 1374 |
| 3    | 832, 831, 1333, 833, 827     |
| 4    | 840, 842, 841, 840, 842      |
| 5    | 1348, 1348, 1347, 1348, 1348 |

## Lỗi đã sửa

Ghi cùng version trước đây dùng SQLSTATE `40001`, khiến PostgREST cloud retry đến lỗi gateway 504. Migration `20261001083254_board_conflict_http409.sql` đã áp dụng cloud, đổi lỗi nghiệp vụ sang `PT409`/HTTP409. Client coi đây là thất bại xác định và tải snapshot để xử lý conflict, thay vì giữ trạng thái chưa xác nhận. Giữ nguyên transaction, kiểm tra quyền và grants.

Tham khảo [Supabase về retry với custom SQLSTATE](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

## Chạy lại

```sh
npm ci
npx playwright install chromium
npm test
npm run typecheck:e2e
npm run test:e2e
npm run build
npm run test:e2e:cloud
```

Cloud cần `.env.local` public URL/key và `.env.e2e.local` chứa `E2E_OWNER_EMAIL`, `E2E_OWNER_PASSWORD`, `E2E_MEMBER_EMAIL`, `E2E_MEMBER_PASSWORD`, `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD`. Dùng tài khoản thử đã xác minh. File credentials bị Git ignore; không đưa vào source/commit. Cloud test tạo workspace/dataset riêng mỗi lượt; không chạy tự động cùng unit tests. Cloud trace/video tự động tắt.

Port 5180 dùng fixture local, 5190 dùng cloud. Kết quả ở `output/playwright/` (ignored); xem report local bằng `npm run test:e2e:report`. Suite cloud đóng session của chính nó và archive dữ liệu thử.

## Phần còn cần nghiệm thu thủ công

- Email đăng ký/xác minh/reset thật và redirect từ inbox: chưa truy cập inbox, không đổi mật khẩu tài khoản người dùng. UI route/invalid link đã kiểm tra local; đăng nhập tài khoản verified đã kiểm tra cloud.
- Lời mời hết hạn kiểm tra bằng SQL local; cloud đã thử link thu hồi/sai email và chấp nhận lặp.
- Cảm ứng thiết bị thật và screen reader chưa thử; responsive Chromium không thay thế chúng.
- Realtime bình luận mới đã có test logic và comment cloud RPC; chưa có assertion hai trình duyệt nhận comment mới trong suite cloud này.

Không đánh dấu M3 hoàn tất toàn bộ khi các mục nghiệm thu trên còn mở. Không yêu cầu deployment/CI remote để chốt MVP local.
