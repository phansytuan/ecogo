# Sao lưu và khôi phục PostgreSQL

PostgreSQL là nguồn dữ liệu chính của ECOGO. Redis chỉ chứa cache và hàng đợi,
vì vậy có thể tạo lại Redis khi xảy ra sự cố. Bản sao lưu PostgreSQL phải được
lưu ngoài VPS; thư mục sao lưu cục bộ không phải là một bản sao an toàn.

Các lệnh bên dưới chạy trên VPS host, từ thư mục gốc của repository. Cấp quyền
thực thi lần đầu:

```sh
chmod +x ops/backup-db.sh ops/restore-db.sh
```

## Sao lưu hằng ngày

Ví dụ cron chạy lúc 02:15:

```cron
15 2 * * * cd /path/to/ecogo && ./ops/backup-db.sh >> ops/backup.log 2>&1
```

Mặc định script ghi vào `./ops/backups`, giữ 14 ngày và kiểm tra dump bằng
`pg_restore --list`. Có thể cấu hình:

```sh
BACKUP_DIR=/srv/ecogo-backups RETENTION_DAYS=14 ./ops/backup-db.sh
```

`OFFSITE_CMD` hỗ trợ `{}` làm vị trí của đường dẫn dump. Nếu không có `{}`,
đường dẫn dump được nối vào cuối câu lệnh.

Ví dụ tải lên rclone:

```sh
OFFSITE_CMD='rclone copy {} remote:ecogo-postgres' ./ops/backup-db.sh
```

Ví dụ tải bằng scp:

```sh
OFFSITE_CMD='scp {} backup@example.com:/srv/backups/ecogo/' ./ops/backup-db.sh
```

Nên cấu hình SSH key hoặc rclone credential riêng cho tài khoản chạy cron,
giới hạn quyền ghi vào đúng thư mục backup.

## Diễn tập khôi phục hằng tháng

Tải một dump từ nơi lưu ngoài VPS rồi khôi phục vào database thử nghiệm:

```sh
RESTORE_CONFIRM=yes ./ops/restore-db.sh /path/to/ecogo-YYYYmmdd-HHMMSS.dump
```

Script sẽ:

1. kiểm tra định dạng dump;
2. tạo lại database `ecogo_restore_check`;
3. khôi phục toàn bộ dữ liệu;
4. in số bảng, số dòng của các bảng nghiệp vụ chính và số cột của `rides`.

Kiểm tra thêm dữ liệu nếu cần, sau đó xoá database thử nghiệm:

```sh
docker compose exec -T db dropdb -U ecogo ecogo_restore_check
```

Ghi ngày diễn tập, tên dump, kết quả kiểm tra và người thực hiện vào nhật ký
vận hành.

## Khôi phục sau thảm hoạ

Lệnh này dừng API, xoá database live, tạo lại database, khôi phục dump rồi khởi
động API. Chỉ chạy sau khi đã xác nhận đúng file:

```sh
RESTORE_CONFIRM=yes ./ops/restore-db.sh \
  /path/to/ecogo-YYYYmmdd-HHMMSS.dump \
  --target ecogo \
  --i-know-this-destroys-data
```

Nếu restore thất bại sau khi API đã dừng, script cố gắng khởi động lại API và
trả mã lỗi khác 0. Không xoá dump cục bộ cho tới khi đã kiểm tra hệ thống.
