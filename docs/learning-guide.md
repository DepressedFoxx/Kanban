# Học Vue ngay trong Kanban

Đọc theo luồng main.ts → App.vue → router → BoardView → BoardColumn → TaskCard → store.

## 1. ref và reactive

Trong BoardView, `query`, `priority`, `open` là các ref vì từng giá trị được thay thế độc lập. Trong script cần `.value`; template tự mở ref cấp cao nhất. `progress` là computed vì được suy ra từ task, không cần lưu thêm một bản state.

TaskDialog dùng reactive cho nhóm field. Khi mở form, Object.assign cập nhật các field trên cùng proxy. Form là bản nháp: gõ chưa làm thay đổi task gốc, nên Hủy có thể đóng mà không rollback store.

Bài tập: nhập tên mới rồi Hủy. Mở lại phải thấy tên cũ. Nếu sửa thẳng props.task.title, vì sao hành vi này bị phá vỡ? Props object có dữ liệu nested có thể bị mutate; emit/action và bản nháp giúp xác định nơi có quyền ghi.

## 2. v-bind, v-model và sự kiện

`:disabled="!canSave"` đưa boolean từ state vào nút. `disabled="false"` vẫn là một thuộc tính HTML hiện diện nên không tương đương.

`v-model="form.title"` đồng bộ ô nhập và state. Với text input, có thể hình dung là :value + @input; Vue còn xử lý nhập liệu IME. Chỉ dùng :value không tự cập nhật state khi gõ.

`v-model:open="open"` trên TaskDialog là :open và @update:open. Con emit false; cha cập nhật open. `@click="edit(task)"` chỉ chạy khi click, không chạy ngay lúc render.

Bài tập: thay v-model của ô tên bằng :value, gõ rồi quan sát canSave. Giải thích vì sao chữ trong input và state không đồng bộ.

## 3. computed thay cho watch

`canSave`, `progress`, danh sách cards là dữ liệu suy ra. computed theo dõi dependency reactive và cache kết quả. Getter không gọi API hay sửa state khác.

`cards` là writable computed: getter lấy task theo cột; setter nhận danh sách mới từ draggable và gọi store.reorder. Đây là nơi chuyển tương tác UI thành thay đổi nghiệp vụ. Khi lọc, kéo thả tắt vì setter không được dùng tập con để thay cả cột.

Bài tập: thêm computed đếm task ưu tiên cao. Không tạo ref rồi viết watcher đồng bộ.

## 4. watch và lifecycle

Watcher trong TaskDialog chạy khi open đổi để khởi tạo bản nháp. Không dùng onMounted cho việc này: component TaskDialog được giữ tồn tại khi dialog đóng/mở, nên onMounted không lặp theo mỗi lần mở.

State thay đổi ngay; DOM được Vue cập nhật theo batch. Nếu tự hiện input rồi focus, phải đợi nextTick. Dialog đang dùng Reka để xử lý focus khi mở và giữ focus trong modal.

Khi thêm realtime, watch boardId để đổi subscription. Cleanup subscription cũ trước khi đăng ký mới và khi unmount. onUpdated không phải nơi lưu task: nó có thể chạy do nhiều cập nhật không liên quan và tạo vòng lặp nếu sửa state.

## 5. Store và dữ liệu

TaskCard nhận prop task, emit edit/move. Store sở hữu mảng tasks. persist ghi snapshot có version vào localStorage. Khi reload, Zod kiểm tra dữ liệu trước khi đưa vào state. Backend chưa tồn tại; local validation không thay thế RLS/server validation sau này.

Bài tập: thêm field label đi qua model → form → card → storage. Reload phải còn label. Sau đó thử dữ liệu local hỏng để kiểm tra thông báo lỗi.

## Tiêu chí tự kiểm tra

- Vẽ được luồng click thẻ → form → save → store → DOM.
- Giải thích vì sao Hủy không sửa task gốc.
- Giải thích khác biệt computed/handler/watch/onMounted trong các file thật.
- Biết vì sao không kéo thả khi đang lọc.
- Chạy test và sửa được một test đỏ do lỗi mất task khi chuyển cột.
