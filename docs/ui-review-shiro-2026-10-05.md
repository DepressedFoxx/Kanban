# Review UI toàn ứng dụng — Shiro

## Kết quả sửa spacing và màu (2026-10-05)

Đã xử lý phần bổ sung padding/box model và phân lớp màu:

- My Tasks: 9 wrapper field dùng gap 8px; khoảng cách giữa các trường 16px.
- Token chung: canvas #eef2f6, card/dialog trắng, cột #e2e8f0, border panel #cbd5e1; divider nhẹ riêng #e2e8f0. Giữ input trắng và border điều khiển #8393ad.
- Panel Settings (export, thông tin chung, vòng đời, lịch sử) thống nhất nền trắng, max-width 672px, padding 16px mobile / 24px desktop.
- Dialog/alert dialog dùng nền trắng và padding responsive; các section task bỏ margin cộng dồn, giữ divider và padding-top 16px. Sticky actions dùng nền trắng và offset theo padding.
- Đo browser: cả 9 field My Tasks đều gap 8px ở desktop/mobile 390px; dialog mobile padding 16px, không overflow ngang; 4 panel Settings desktop đều padding 24px và nền trắng. Escape đóng dialog bình thường.
- Build thành công (còn cảnh báo bundle size/Zod có sẵn); 177/177 tests pass. Assertion cũ về câu hướng dẫn bản nháp được thay bằng kiểm tra dialog còn mở và có nút lưu, vẫn giữ assertion giá trị draft sau snapshot realtime.

Phạm vi lần sửa này là phần spacing/màu bổ sung; không đánh dấu toàn bộ R1–R9 bên dưới đã hoàn tất. Các số đo trong phần hiện trạng là trước khi sửa.

## Bổ sung: padding, box model và phân lớp màu

Kiểm tra theo yêu cầu tiếp theo ngày 2026-10-05, bằng computed style và bounding rectangles trên browser live. Chưa sửa source sản phẩm. Các con số là CSS pixels; đo khoảng cách label/control khi panel đang mở. Không sử dụng phép đo của nội dung ẩn.

### Spacing xác nhận được

| Vị trí                                      | Hiện trạng đo được                                                               | Đánh giá / hướng sửa                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| My Tasks: search + 8 trường filter nâng cao | Label → control **0px**, wrapper `display:block` không có gap                    | Lỗi cụ thể gây cảm giác dính. Dùng wrapper field `display:grid; gap:8px`, không tăng padding bên trong input để chữa khoảng cách bên ngoài.                                    |
| Form task, thành viên, settings             | Label → control 7px                                                              | Có khoảng cách đúng loại; thống nhất thành token 8px, không coi đây là lỗi thiếu padding.                                                                                      |
| Bình luận và thêm file                      | Label → control 8px                                                              | Giữ.                                                                                                                                                                           |
| Dialog task                                 | Padding 24px; grid gap 16px; TaskExtras còn mt=20/pt=16, Attachments mt=24/pt=20 | Gap cha cộng margin/padding con tạo nhịp cách nhóm quá lớn, trong khi trường ở trang khác lại sát nhau. Chọn một nơi quản lý khoảng cách: gap của cha hoặc margin của section. |
| Cột Kanban / task card                      | Cột padding 14px dọc, 12px ngang; card 16px; gap giữa cột 16px                   | Không phát hiện nội dung card chạm mép. Cảm giác chìm chủ yếu do màu cột/nền và border; không cần tăng tất cả padding.                                                         |
| Settings                                    | Export padding 16px; form và lifecycle 20px; history 0px                         | Các nhóm ngang cấp có cách bọc khác nhau. Chuẩn hoá panel thường và tách history có chủ đích.                                                                                  |

Các phần đã đo dùng `box-sizing:border-box`; chưa có bằng chứng box-sizing sai là nguyên nhân. Tailwind gap của grid ngoài chỉ tách các wrapper, không tạo khoảng cách giữa Label và Input nằm bên trong một wrapper.

### Màu: độ phân lớp thấp, không phải chữ chính thiếu tương phản

Tỷ lệ dưới đây tính từ token sRGB đã đối chiếu computed style. Tỷ lệ giữa hai bề mặt được dùng để giải thích sự gần màu, **không áp ngưỡng tương phản chữ cho mọi nền/card và không kết luận vi phạm WCAG chỉ từ các tỷ lệ đó**.

| Cặp màu                                |   Tỷ lệ | Ý nghĩa                                            |
| -------------------------------------- | ------: | -------------------------------------------------- |
| Card trắng #ffffff / nền trang #f8fafc |  1.05:1 | Card chỉ khác nền rất nhẹ.                         |
| Cột #f1f5f9 / nền trang #f8fafc        |  1.05:1 | Cột rất dễ chìm vào canvas.                        |
| Border #e2e8f0 / card trắng            |  1.23:1 | Viền panel, outline button và divider đều rất nhẹ. |
| Border input #8393ad / trắng           |  3.11:1 | Input hiện phân biệt tốt hơn panel.                |
| Chữ chính #0f172a / nền trang          | 17.06:1 | Không cần làm đậm thêm chữ toàn app.               |
| Chữ phụ #475569 / nền trang            |  7.24:1 | Màu chữ phụ hiện đủ khác nền trong cặp màu này.    |
| Primary #2457d6 / trắng                |  6.16:1 | Giữ primary hiện tại.                              |

Các vị trí cụ thể: dialog dùng cùng `bg-background` với canvas; section checklist/file trong suốt, phân cách bằng border nhạt. Board options cũng trong suốt. Export Settings trong suốt nhưng Thông tin chung trắng. Điều này làm nhóm nội dung khó phân biệt, dù khoảng trống vẫn có.

### Quy ước đề xuất cho lượt sửa

- Field: label/control 8px; control/helper 6–8px; giữa hai field 16px.
- Panel: padding 16px mobile, 24px desktop; giữa panel 24px. Dialog 16px mobile, 24px desktop; tránh cộng cả gap và margin cho cùng một khoảng cách.
- Nhóm button: gap 8px; khoảng cách nội dung → actions 16–24px. Chỉ dùng separator khi chuyển nhóm nội dung.
- Giữ primary #2457d6, chữ chính #0f172a, chữ phụ #475569 và input trắng.
- Thử canvas #eef2f6, card/dialog #ffffff, cột #e2e8f0, border panel #cbd5e1. Đây là palette ứng viên, cần review lại sau khi áp dụng; không phải thay đổi đã thực hiện.
- Tách `border-subtle` cho divider trang trí và `border-control` cho control cần nhận diện. Không tăng mọi border toàn app lên cùng độ đậm.
- Không dùng cùng nền muted cho cả cột, readonly, selected và disabled. Selected thêm viền/indicator primary; disabled dùng token riêng thay vì chỉ giảm opacity toàn button nếu muốn trạng thái rõ hơn.

Ưu tiên: sửa wrapper field của My Tasks → thống nhất surface card/dialog/column → bỏ cộng dồn gap/margin trong task → chuẩn panel Settings. Sau đó kiểm tra lại 390/768/1440px và đo màu ở trạng thái normal/hover/focus/disabled.

Ngày: 2026-10-05 (Asia/Bangkok). Chế độ: full review, không sửa source sản phẩm.

## Kết luận

**72/100 — nền tảng thị giác tốt hơn trước, nhưng các module mới chưa tạo thành một luồng sử dụng thống nhất.** Vấn đề chính là thứ bậc nội dung, phạm vi tab và cách lưu dữ liệu. Không cần thay bảng màu lần nữa để giải quyết những vấn đề này.

Ship call: phù hợp tiếp tục dùng thử cá nhân/dev local; nên xử lý P1 trước khi giới thiệu rộng hoặc chốt trải nghiệm v1. Không phát hiện P0 trong phạm vi quan sát, không đồng nghĩa đã nghiệm thu mọi trạng thái.

## Bằng chứng và giới hạn

Review trực tiếp localhost qua trình duyệt đang đăng nhập, bằng tab review riêng. Đã xem board, dialog task, tab thảo luận, My Tasks, thông báo, danh sách workspace/board, thành viên, settings/export, tài khoản, profile dropdown, drawer và hướng dẫn. Đã đối chiếu code của App shell, task dialog, settings, members, guide và auth.

Viewport kiểm tra: desktop 1440×1000; board ở 768×1024; board, tài khoản, drawer, My Tasks và hướng dẫn ở 390×844. Không khẳng định đã kiểm tra mọi route ở cả ba kích thước. Board 390px không tràn ngang trong lần đo.

Chỉ mở trang, menu, tab và bộ lọc; không lưu form, upload, gửi email, thay quyền hay xoá dữ liệu. Không đăng xuất phiên người dùng. Auth login/register/reset/callback và invitation chỉ thuộc phạm vi đối chiếu source/route, chưa kiểm tra lại toàn luồng trực tiếp trong lượt review này. Thông báo hiện rỗng, task đang xem chưa có attachment; chưa đánh giá trực tiếp notification list nhiều mục, progress upload, lỗi mạng hoặc file dài tên.

Không chạy lại axe, không đo contrast bằng công cụ, không nghiệm thu Narrator/NVDA, hover hay chất lượng animation. Các kết quả test G5 trước đó không được coi là bằng chứng review trực tiếp mới.

## Điểm theo rubric Shiro

| Tiêu chí                 |       Điểm | Nhận định                                                                                                                                             |
| ------------------------ | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thông điệp và mục đích   |      16/20 | Hiểu được quản lý công việc, CTA có động từ; còn nhiều mô tả kỹ thuật và thuật ngữ trộn Việt/Anh.                                                     |
| Thứ bậc thông tin        |       9/15 | Toolbar/accordion chiếm chỗ của task; export nằm trước settings thông thường; bình luận nằm sau checklist/file.                                       |
| Tương tác và khả dụng    |      10/15 | Điều hướng và menu có cấu trúc; tab task và nhiều phạm vi lưu chưa đáp ứng kỳ vọng rõ ràng.                                                           |
| Nhất quán thị giác       |      12/15 | Màu xanh, input trắng, đường viền và icon khá đồng bộ; các trang dùng chiều rộng và bố trí hành động khác nhau.                                       |
| Bản sắc                  |      10/15 | Nhẹ, phù hợp ứng dụng làm việc; nhận diện còn phổ thông, logo desktop/mobile/auth có cách trình bày khác nhau. Không cần thêm trang trí để tăng điểm. |
| Khả năng đọc và tiếp cận |       8/10 | Label, trạng thái chọn, focus của input rõ; email readonly bị cắt trên mobile, phần nội dung chính phải cuộn nhiều. Chưa chứng nhận WCAG.             |
| Hoàn thiện / QA          |       7/10 | Không thấy vỡ ngang ở board 390px; thông tin phụ, điều hướng workspace và hướng dẫn chưa theo kịp module mới.                                         |
| **Tổng**                 | **72/100** | **Ưu tiên sửa luồng sử dụng trước khi làm đẹp thêm.**                                                                                                 |

## Các vấn đề cần sửa

### R1 — P1: Tab thảo luận vẫn chứa nội dung của tab chi tiết

**Bằng chứng:** click “Bình luận & lịch sử” trong task chỉ ẩn form thông tin chính. Nhãn, checklist, nút nhân bản và file đính kèm vẫn nằm trước vùng bình luận. Ở desktop, phần viết bình luận bị đẩy xuống ngoài phần lớn viewport của dialog.

**Ảnh hưởng:** thao tác chọn tab không đưa người dùng tới nội dung họ yêu cầu; trên điện thoại càng phải cuộn nhiều.

**Sửa:** đặt toàn bộ thông tin, nhãn/checklist, file và nhân bản trong panel Chi tiết; panel Thảo luận chỉ chứa bình luận/lịch sử. Dùng tab component với panel và trạng thái active rõ. Giữ draft khi đổi tab.

**Nguồn:** `src/features/boards/OnlineTaskDialog.vue`: form dùng `v-show="!showDiscussion"`, nhưng TaskExtras/TaskAttachments không được đặt dưới cùng điều kiện.

**Nghiệm thu:** chọn Thảo luận thấy composer hoặc danh sách comment ngay; không có checklist/file chen giữa; đổi tab không mất bản nháp.

### R2 — P1: Một dialog có nhiều cách lưu nhưng mô tả chung gây hiểu nhầm

**Bằng chứng:** đầu dialog ghi “Thay đổi chỉ được lưu khi bạn xác nhận”; bên trong có Lưu công việc, Lưu nhãn và checklist, thao tác theo dõi, upload file và gửi bình luận độc lập. Nút Lưu công việc xuất hiện trước các phần bổ sung.

**Ảnh hưởng:** người dùng có thể nghĩ nút Lưu công việc lưu mọi thứ hoặc đóng dialog sẽ huỷ file vừa upload. Đây là vấn đề mô hình tương tác, không phải yêu cầu thay transaction backend ngay lập tức.

**Sửa:** ghi phạm vi rõ: “Thông tin công việc cần bấm Lưu; bình luận và file được lưu riêng.” Đặt nhãn “Chưa lưu/Đã lưu” cạnh từng nhóm, đổi nút thành “Lưu thông tin”. Tách hành động tức thời khỏi footer của form. Nếu sau này hợp nhất nút lưu, phải có hợp đồng transaction/retry tương ứng.

**Nghiệm thu:** một người mới phân biệt được phần nào đã lưu và phần nào còn nháp; bảo vệ đóng dialog bao phủ mọi draft.

### R3 — P1: Board mobile dành gần hết màn hình đầu cho thanh công cụ

**Bằng chứng:** ở 390×844, heading “Cần làm” có toạ độ y≈755px. Phía trên gồm tải lại, tạo task, dòng sync, tuỳ chọn board, lưu trữ, ba bộ lọc, quản lý nhãn và bulk actions. Các heading trạng thái tiếp theo ở khoảng y=1134, 1513, 1763px. Đây là đo trên board có hai task, không phải benchmark dữ liệu lớn.

**Ảnh hưởng:** mở board mà gần như chưa nhìn thấy công việc; khó so sánh bốn trạng thái khi chúng xếp dọc. iPad vẫn dành hơn nửa chiều cao ban đầu cho các điều khiển phụ.

**Sửa:** giữ tên board + Tạo công việc + tìm kiếm; gom filter vào drawer có badge số điều kiện. Quản lý nhãn, lưu trữ, đổi tên chuyển vào menu board. Bulk actions chỉ mở khi vào chế độ chọn. Trên mobile dùng bộ chọn trạng thái có số lượng + danh sách task, hoặc chế độ Danh sách/Kanban; không đưa overflow vào header.

**Nghiệm thu:** ở 390×844 với tên board bình thường, task đầu tiên nhìn thấy rõ ngay trong màn hình đầu; tất cả trạng thái truy cập được mà không phải đi qua toàn bộ cột phía trước.

### R4 — P2: Khối “Không gian làm việc” đang hiển thị tên trang

**Bằng chứng:** sidebar hiện “Không gian làm việc / Công việc của tôi”, “Không gian làm việc / Thông báo”, hoặc “kanban” trên trang tài khoản. Drawer cũng dùng cùng nhãn này. Khối có hình thức giống thẻ ngữ cảnh nhưng không phải công cụ đổi workspace.

**Ảnh hưởng:** ngữ cảnh workspace và trang cá nhân bị trộn, dễ hiểu nhầm đã đổi workspace khi mở thông báo.

**Sửa:** tách page title khỏi workspace context. Trang toàn cục dùng “Tất cả workspace” hoặc bỏ khối workspace; trang thuộc workspace hiển thị tên thật. Nếu muốn làm workspace switcher thì phải có affordance và hành vi chọn workspace thực sự.

**Nguồn:** `src/App.vue`, computed `workspaceLabel` và nhãn cố định “Không gian làm việc”.

### R5 — P2: Settings ưu tiên export hơn thông tin thường dùng; sửa tên bị lặp

**Bằng chứng:** Xuất dữ liệu là section đầu tiên trong Settings, trước Thông tin chung. Trang Thành viên còn có form Tên workspace/Lưu tên trong khi Settings đã có cùng trường. Link Board/Thành viên/Cài đặt đổi vị trí giữa các trang.

**Sửa:** thứ tự Settings: Thông tin chung → Thành viên/liên kết quản lý → Dữ liệu & export → Quyền sở hữu/lưu trữ → Lịch sử. Chỉ sửa tên ở Settings. Dùng navigation workspace thống nhất: Board / Thành viên / Cài đặt. Giữ form có độ dài dòng hợp lý; không kéo input phủ toàn màn hình chỉ để lấp khoảng trống.

### R6 — P2: Bộ lọc My Tasks lấn át danh sách

**Bằng chứng:** sáu nhóm nhanh, mô tả timezone, tải lại, trạng thái realtime, search, Áp dụng/Xoá và saved filters đều đứng trước task. Khi mở bộ lọc nâng cao trên 390px, tám trường trải dài khiến nút áp dụng và kết quả xuống xa.

**Sửa:** nhóm Đang mở/Quá hạn/Hôm nay dễ thấy, nhóm còn lại trong lựa chọn bổ sung; filter nâng cao mở sheet có footer Áp dụng cố định, chip điều kiện hiện ngay cạnh kết quả. Bộ lọc đã lưu đặt cạnh nút Bộ lọc. Giữ nguyên quy tắc lọc chỉ áp dụng khi xác nhận nếu đó là lựa chọn sản phẩm, tránh đổi ngầm sang auto-apply.

### R7 — P2: Quá nhiều thông tin vận hành trong luồng thường ngày

**Bằng chứng:** dòng “Đã đồng bộ / cập nhật trực tiếp / lần xác nhận gần nhất” trên board; quota và thời hạn signed URL thành nhiều dòng ở file; “Múi giờ IANA” là input text yêu cầu người dùng biết định danh; lẫn task/board/workspace/Owner/Settings.

**Sửa:** trạng thái khoẻ thu gọn thành “Đã đồng bộ”, chỉ mở chi tiết khi cần; lỗi/offline vẫn nổi bật. File giữ loại/kích thước và dung lượng, đưa giải thích thu hồi link vào disclosure trợ giúp. Chọn múi giờ có tìm kiếm và nhãn dễ đọc. Thống nhất từ vựng UI, giữ thuật ngữ kỹ thuật ở docs.

### R8 — P2: Profile đã gọn nhưng còn điều hướng trùng và email bị cắt

**Bằng chứng:** desktop có Tài khoản ở sidebar và trong profile menu; drawer có cả “Tài khoản” và “Thông tin tài khoản”. Ở 390px, email readonly trong trang Account bị cắt phần cuối.

**Sửa:** dùng một entry hồ sơ trong khu vực account ở cuối drawer; sidebar chính tập trung công việc. Email hiển thị dạng văn bản có wrap, badge “Đã xác minh”, nút copy nếu cần. Giữ input chỉ cho trường có thể sửa.

### R9 — P2: Empty state/phân trang/hướng dẫn chưa theo kịp tính năng

**Bằng chứng:** thông báo rỗng vẫn hiện hai nút phân trang disabled; My Tasks chỉ một trang vẫn có trước/sau disabled. Guide chưa hướng dẫn My Tasks, thông báo, checklist, attachment/export; còn nhắc route board cá nhân cũ. Auth dùng cùng mô tả mở workspace cho cả quên/đặt lại mật khẩu (đối chiếu source).

**Sửa:** ẩn pagination khi không có trang bổ sung; empty notification dùng “Bạn chưa có thông báo” nếu không có filter. Guide chia theo nhiệm vụ và link trực tiếp tới module. Auth dùng mô tả theo từng trạng thái. Chuyển thông tin legacy sang tài liệu chuyển đổi thay vì hướng dẫn chính.

## Giữ lại

- Input sửa được có nền trắng, viền rõ; email readonly có nền khác. Không cần đổi palette tổng thể lần nữa.
- Primary xanh và màu nguy hiểm có vai trò rõ; nền nhẹ phù hợp dùng lâu. Không bổ sung gradient/card trang trí không phục vụ thao tác.
- Icon điều hướng đồng bộ, mobile đã có drawer; profile desktop nằm trong dropdown, email không chiếm header thường trực.
- Board có cách đổi trạng thái bằng control ngoài kéo thả; overdue có chữ, không chỉ dựa vào màu.
- Các hành động như tạo link mời giải thích đúng việc ứng dụng không gửi email; cần giữ sự rõ ràng này khi rút ngắn copy.

## Thứ tự triển khai đề xuất

1. R1 + R2: cấu trúc task dialog, phạm vi lưu, bảo vệ draft.
2. R3 + R6: toolbar và filter theo kích thước màn hình; task là nội dung chính.
3. R4 + R5 + R8: workspace context, navigation, settings và account.
4. R7 + R9: microcopy, trạng thái rỗng và hướng dẫn.

Sau khi sửa: review lại 390/768/1440px, thử bàn phím và focus khi đổi tab/đóng drawer, nội dung dài, quyền Viewer, empty/error/offline và draft conflict. Kiểm tra accessibility tự động bổ sung, không thay thế screen reader thực tế.
