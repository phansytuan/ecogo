# ECOGO — Hồ sơ kế hoạch phát triển (MVP)

Nền tảng kết nối xe ghép liên tỉnh/liên huyện (cự ly ≥35km), số hóa quy trình
đặt xe hiện đang chạy qua Facebook/Zalo/điện thoại. Tài liệu này tóm tắt các
quyết định kiến trúc và kế hoạch; hai file kèm theo là phần chi tiết để dùng thật.

## Nội dung gói

- `README.md` — bản tóm tắt này.
- `ecogo_schema.sql` — schema đầy đủ PostgreSQL 16 + PostGIS (chạy thẳng được).
- `ecogo_backlog_mvp.xlsx` — backlog Giai đoạn 1: 49 hạng mục, ước lượng, phụ thuộc, tuần.

---

## 1. Kiến trúc

Modular monolith — một codebase backend chia module rõ ràng, deploy như một
service. Đơn giản, rẻ, dễ bảo trì; ranh giới module sạch để tách microservices sau.
Chưa đụng Kubernetes/Kafka/MongoDB cho tới khi có tải thật.

Thành phần: 3 client (App Hành khách + App Tài xế bằng Flutter, Bàn điều phối web
React) → API Backend (NestJS, REST + WebSocket) → PostgreSQL/PostGIS + Redis,
gọi các dịch vụ ngoài: Goong Maps, FCM, SMS OTP.

## 2. Tech stack (đặc thù VN)

- Mobile: Flutter (2 app, chung codebase).
- Backend: NestJS (Node/TypeScript), realtime qua WebSocket.
- DB: PostgreSQL 16 + PostGIS; Redis cho cache/realtime/queue.
- Bản đồ & chỉ đường: Goong Maps (rẻ hơn Google ở VN), Google/Mapbox dự phòng.
- OTP: Firebase Auth (phone) hoặc eSMS; Push: FCM.
- Hạ tầng: VPS + Docker Compose + Postgres managed (ưu tiên chi phí thấp).

## 3. Engine ghép xuyên tuyến (trái tim sản phẩm)

Khác biệt cốt lõi: ghép theo *đoạn dọc tuyến*, không phải điểm-điểm. Tài xế
đi A→B vẫn đón được khách ở một đoạn con của tuyến.

- Lưu lộ trình tài xế dạng `geometry(LineString, 4326)` (polyline từ Goong).
- Khách gần tuyến: `ST_DWithin(route::geography, point::geography, 2000)`.
- Cùng chiều: `ST_LineLocatePoint(route, pickup) < ST_LineLocatePoint(route, dropoff)`
  (fp < fd).
- Độ dài quãng đi chung: `ST_Length(ST_LineSubstring(...)::geography)`.

Engine tham số hóa: chế độ tự động chạy chặt (≤2km, có ngưỡng); chế độ điều phối
chạy lỏng (≤5km, bỏ ngưỡng) — cùng một code path.

Các bẫy cần nhớ: (1) "gần tuyến" ≠ "ít vòng vo" — lọc thô bằng PostGIS rồi chỉ
gọi directions API tính detour cho top-K; (2) ghế theo đoạn, không theo cả chuyến
(MVP đơn giản hóa, dữ liệu fp/fd đã lưu sẵn cho v1.5); (3) khách quan tâm giờ
ĐÓN — ETA@đón ≈ departure_time + fp × duration_s.

Tiến hóa: v1 SQL thuần → v1.5 detour API + ghế theo đoạn → v2 gán nhiều khách
tối ưu (kiểu VRP) khi đủ volume. Không đụng ML quá sớm.

## 4. Dữ liệu (xem ecogo_schema.sql)

Bảng chính: users (roles[] vì một người có thể vừa khách vừa tài xế), vehicles,
rides (route geometry), bookings (fp/fd + CHECK fp<fd), referrals +
affiliate_earnings (sổ cái 3 năm — cần có từ ngày đầu), transactions (tiền mặt +
phí 10%), ratings, support_tickets.

GPS thời gian thực KHÔNG vào Postgres — sống ở Redis (TTL ngắn) + WebSocket, chỉ
flush lịch sử nếu cần.

## 5. Vận hành điều phối

Rule "15 phút chưa ghép → đẩy bộ phận điều phối" biến con người thành một phần
của vòng lặp matching, nên engine tự động được phép đơn giản. Bàn điều phối (cockpit)
là tính năng cốt lõi: hàng đợi realtime + bản đồ trực tiếp + ghép tay.

Quyết định kỹ thuật: WebSocket hai luồng (sự kiện no_match + vị trí tài xế);
khóa claim tránh hai điều phối viên gán trùng; audit `dispatched_by` mọi lần gán
tay; SLA 15 phút là delayed job trên Redis (BullMQ).

## 6. Lộ trình & ước lượng (xem ecogo_backlog_mvp.xlsx)

- Giai đoạn 0: validate cầu thật trên 1 tuyến bằng Zalo OA / ghép tay (vài tuần).
- Giai đoạn 1 (MVP, ~12 tuần): auth, đăng/tìm/đặt chuyến, engine ghép v1 +
  fallback điều phối, chat + tracking, tiền mặt, đánh giá, pilot 1 tuyến.
- Giai đoạn 2: matching tốt hơn, masked call, ví/thanh toán, tự động affiliate, hàng hóa.
- Giai đoạn 3: tách module nóng, queue, mở rộng đa tuyến.

Khối lượng Giai đoạn 1: ~155 ngày công (≈194 khi cộng buffer 25%). Đường găng:
Backend cốt lõi → Engine ghép → Real-time. Team khuyến nghị: 2 Backend, 1-2 Mobile,
1 Frontend, QA/PM chia sẻ.

## Việc còn lại để quyết "go / no-go"

Ước tính chi phí cloud + API theo mốc người dùng (100 / 1.000 / 10.000 chuyến).
Khoản dễ "cháy túi" nhất nhiều khả năng là Goong Directions — cần đo và tối ưu cache.

## Lưu ý quan trọng ngoài kỹ thuật

Pháp lý đi trước code: xe ghép ở VN liên quan quy định kinh doanh vận tải
(Nghị định 10/2020 và sửa đổi). Cần xác định mô hình "sàn kết nối" hay tự vận hành,
tài xế là cá nhân hay hộ kinh doanh — việc này định hình cả sản phẩm lẫn rủi ro.
(Đây không phải tư vấn pháp lý; nên hỏi luật sư vận tải.)
