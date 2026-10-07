# Phân trang, lọc server và control dùng chung

Cập nhật 2026-10-06. Frontend tiếp tục chạy local; hai migration `server_lists` và `activity_pagination` đã áp dụng lên Supabase sau phê duyệt và kiểm thử SQL local.

## Phạm vi và hợp đồng

| Danh sách                             | RPC                 | Tham số trang                                                         |
| ------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Workspace, board, thành viên, lời mời | `app_list_query`    | `p_page`, `p_page_size`, `p_filters`, `p_source`, `p_workspace`       |
| My Tasks                              | `my_tasks_query`    | `p_page`, `p_limit` (ánh xạ từ pageSize), `p_filters`                 |
| Thông báo                             | `notification_page` | `p_page`, `p_page_size`, `p_unread`                                   |
| Kanban, task lưu trữ                  | `board_page_query`  | `p_pages` theo cột, `p_page_size`, `p_filters`, `p_task`              |
| Bình luận và lịch sử task             | `task_thread_page`  | `p_comment_page`, `p_activity_page`, `p_page_size`                    |
| Lịch sử workspace                     | `activity_page`     | `p_source=workspace_activity`, `p_workspace`, `p_page`, `p_page_size` |

- Trang bắt đầu từ 1. UI chọn 10/20/50 mục, mặc định 20; server giới hạn tối đa 50. Trang vượt tổng được đưa về trang cuối, dữ liệu rỗng trả trang 1.
- Server lọc trước khi đếm/phân trang. Không tải hết task về trình duyệt rồi lọc tên, ưu tiên hoặc người phụ trách.
- Kết quả có `items`, `page`, `pageSize`, `total`. My Tasks giữ hợp đồng cũ `limit`; Kanban trả `tasks` cùng `pages` theo cột; thảo luận trả `comments`, `activity` cùng metadata riêng.
- Thay điều kiện lọc trở về trang đầu. My Tasks lưu pageSize vào URL và đường dẫn quay lại từ task. Kanban debounce bộ lọc 300ms và hủy kết quả cũ bằng generation guard.
- Task được mở bằng deep link có thể nằm ngoài trang/bộ lọc hiện tại: server trả `detail` riêng, không chèn task vào danh sách đang lọc.
- Select người nhận/nhãn và các trình chỉnh sửa có giới hạn sản phẩm (checklist, nhãn, bộ lọc đã lưu, file đính kèm) giữ danh sách lựa chọn có giới hạn, không chia trang như danh sách công việc.
- Board cá nhân `/personal-board` vẫn là dữ liệu localStorage; không gửi dữ liệu cá nhân local lên Supabase.

## Kanban và đồng bộ

Mỗi cột có trang riêng, dùng chung pageSize. Đổi pageSize đưa các cột về trang 1. Khi bộ lọc đang bật hoặc cột còn trang khác, kéo thả tạm tắt vì chỉ số trên trang không biểu diễn thứ tự đầy đủ. Menu chuyển trạng thái vẫn hoạt động và server đặt task ở cuối toàn bộ cột. Chọn hàng loạt chỉ áp dụng task hiện thấy; lựa chọn ra khỏi trang được bỏ để tránh thao tác nhầm task ẩn.

`board_page_mutate` gọi API ghi cũ, giữ version check, receipt, quyền và retry; sau đó trả snapshot phân trang. Không mở rộng quyền ghi. Polling giữ DOM và dữ liệu đã tải, không dựng lại toàn bộ trang. Phân trang dùng offset nên thay đổi từ người khác có thể làm vị trí mục dịch chuyển; tổng/trang hiện tại được đọc lại từ server, không nối các trang cũ vào nhau.

## Component và icon

Cập nhật 2026-10-07: card có menu **⋯** dùng Reka DropdownMenu để mở chi tiết, chuyển trạng thái hoặc lưu trữ trực tiếp. Menu thay dropdown trạng thái ở cuối card. Trạng thái hiện tại được đánh dấu; thao tác ghi bị khóa khi không có quyền hoặc đang lưu. Board cá nhân chỉ có chuyển trạng thái, không hiển thị lưu trữ vì chưa có mô hình archive local. Menu hỗ trợ bàn phím và Escape trả focus về nút mở.

- `ServerPagination.vue` dùng primitives của [Reka UI](https://reka-ui.com/docs/components/pagination), theo cấu trúc [shadcn-vue Pagination](https://www.shadcn-vue.com/docs/components/pagination). Desktop có số trang/ellipsis; mobile và cột Kanban hiển thị trước, trang hiện tại/tổng, sau. Có chọn pageSize, trạng thái disabled, nhãn truy cập và thông báo tổng mục.
- `RefreshButton.vue` là nút icon dùng chung có tên truy cập và tooltip native. Tìm kiếm, mũi tên điều hướng, trạng thái chọn, nút thêm dùng `@lucide/vue`; thao tác chính vẫn có chữ để rõ nghĩa.
- Favicon dùng Lucide Columns3, cùng biểu tượng thương hiệu trên header; giấy phép ISC được giữ trong SVG.
- Mobile dưới 768px hoặc thiết bị con trỏ cảm ứng: input, select, button tối thiểu 44px. Desktop giữ control mặc định 36px. Nút icon trên PageHeader không bị kéo giãn bởi quy tắc chia đều nút mobile.

## Kiểm chứng và giới hạn

`e2e/server-lists.spec.ts` kiểm tra lọc trước phân trang, đếm tổng, trang cuối, Owner/Member/Viewer/outsider, anon không EXECUTE, deep link ngoài trang, request đổi page/pageSize và chiều cao/căn hàng/overflow ở 390/544/768/1440px. Bộ productivity kiểm tra bình luận edit/conflict/delete và bulk sau thay icon. Toàn bộ 179 unit/SQL test đã đạt; build và TypeScript đã kiểm tra.

Cloud đã kiểm tra tải/lọc workspace thật. Sáu RPC mới đều có `search_path=''`, authenticated được EXECUTE, anon không được EXECUTE. Supabase Advisor vẫn đánh dấu các API SECURITY DEFINER theo kiến trúc RPC có kiểm tra quyền; không coi đây là báo cáo không cảnh báo. Xem [giải thích advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Cảnh báo Auth leaked-password protection đang tắt là cấu hình sẵn có, ngoài thay đổi này: [tài liệu cấu hình](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Giới hạn hiệu năng: API danh sách tổng quát và Kanban tái sử dụng tập dữ liệu được cấp quyền của RPC hiện tại rồi lọc/phân trang **trên server**. Payload trình duyệt đã giới hạn, nhưng SQL chưa tối ưu thành truy vấn trực tiếp trên index cho từng nguồn. Cần profiling và chuyển sang WHERE/COUNT/LIMIT trực tiếp nếu dữ liệu tăng lớn; không tuyên bố đã tối ưu cho quy mô lớn. Bình luận, lịch sử và thông báo dùng COUNT/LIMIT/OFFSET trực tiếp.
