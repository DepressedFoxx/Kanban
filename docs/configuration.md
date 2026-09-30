# Cấu hình và UI dùng chung

## Sửa ở đâu?

| Nhu cầu                                                                | Nguồn cấu hình               |
| ---------------------------------------------------------------------- | ---------------------------- |
| Tên app, workspace mẫu, locale, đường dẫn, storage key, tốc độ kéo thả | src/config/app.ts            |
| Trạng thái, ưu tiên, giới hạn ký tự, giá trị task mặc định             | src/features/board/config.ts |
| Màu semantic, màu trạng thái, radius                                   | src/assets/tokens.css        |
| Layout responsive, font, CSS nghiệp vụ                                 | src/assets/main.css          |
| URL và public key Supabase theo môi trường                             | .env.example → .env.local    |
| Alias và registry shadcn-vue                                           | components.json              |

Cấu hình tĩnh là object TypeScript có kiểu; không đưa vào Pinia vì không thay đổi trong lúc chạy. State nghiệp vụ tiếp tục nằm ở stores/board.ts. Khi có sở thích người dùng (theme, mật độ hiển thị), tạo store riêng với validation và persistence thay vì sửa object cấu hình tĩnh. Nhãn Cá nhân dùng cho board cá nhân; màn hình workspace lấy tên từ workspace được chọn trong database.

UI và Zod dùng chung taskLimits; thay giới hạn một chỗ sẽ cập nhật cả form lẫn validation. Không đổi ID status/priority hoặc storage key tùy tiện: dữ liệu đã lưu phụ thuộc vào chúng; cần migration nếu thay đổi schema. Giữ nguyên key/version hiện tại để bảng local cũ vẫn đọc được.

## Component UI

Button, Input, Textarea, Label, Select, Dialog, AlertDialog được thêm từ registry bằng shadcn-vue CLI. Source nằm trong src/components/ui; import qua index.ts của từng component. Icon registry được đổi sang @lucide/vue đang dùng trong dự án; nhãn đóng dialog được Việt hóa.

TaskDialog, TaskCard và BoardColumn ghép UI primitive với logic nghiệp vụ. Không đặt logic task trong components/ui. Không dùng CSS toàn cục để ghi đè mọi input/select; đổi token hoặc variant trong component gốc khi cần thay đổi đồng bộ.

Input ngày vẫn dùng type=date bên trong shadcn Input để tận dụng bộ chọn ngày của trình duyệt. Đây là lựa chọn có chủ đích, không phải calendar custom. Chưa có dark mode: cần thay các màu layout còn cố định và kiểm tra tương phản trước khi bật.

Thêm component: npx shadcn-vue@2.8.2 add <component>. Review diff trước khi dùng --overwrite vì source local có tùy chỉnh.

Tài liệu: https://www.shadcn-vue.com/docs/cli

## Màu và trạng thái form

Bảng màu sáng dùng xanh dương cho hành động chính, nền slate nhạt và card trắng. Toàn bộ màu nằm ở `src/assets/tokens.css`. Các token `--field-*` phân biệt input có thể sửa (trắng, viền rõ), hover (viền xanh), focus (outline xanh), readonly (xám nhạt, vẫn chọn/copy được), disabled (xám đậm hơn, con trỏ khóa). Quy tắc dùng chung theo `data-slot` ở `main.css`, bao gồm trường bị disabled bởi fieldset; không giảm opacity toàn bộ chữ trong input. `aria-invalid=true` giữ viền đỏ để chỉ lỗi.
