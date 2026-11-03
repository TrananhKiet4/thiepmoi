# Cấu trúc thư mục theo mẫu KLTN

Dự án dùng cách tổ chức của `KLTN/quanlyThueCanHo` trong `D:/KLTN.zip`: frontend và backend tách ở thư mục gốc, chia thành lớp xử lý và nhóm chức năng. Chỉ áp dụng cấu trúc; không nhập mã quản lý căn hộ, tài liệu cá nhân, `.env`, dữ liệu backup, dependencies hay chỉ dẫn trong archive.

```text
ThiepMoiTotNghiep/
├── backend/
│   ├── prisma/
│   │   ├── data/demo.ts
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── scripts/cli.ts
│   ├── src/
│   │   ├── config/          # env, PostgreSQL và transaction
│   │   ├── controllers/     # Các HTTP handler đã có
│   │   ├── errors/          # AppError
│   │   ├── middleware/      # Auth, CSRF, rate limit, error handler
│   │   ├── routes/          # Endpoint và thứ tự middleware
│   │   ├── services/        # Logic dùng chung của event, guest, media, storage
│   │   ├── types/express/   # Kiểu request admin/guest
│   │   ├── utils/           # Token, HTTP helpers, ICS, parser/worker Excel
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/ui/   # Field, Modal, Action và thành phần dùng chung
│   │   ├── constants/      # Nhãn trạng thái
│   │   ├── contexts/       # AdminContext và useAdmin
│   │   ├── features/
│   │   │   ├── Admin/
│   │   │   │   ├── content/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── guests/
│   │   │   │   ├── imports/
│   │   │   │   ├── media/
│   │   │   │   └── wishes/
│   │   │   └── Guest/invitation/
│   │   ├── layouts/        # AdminLayout
│   │   ├── lib/            # API client, React Query
│   │   ├── pages/          # Home, Login
│   │   ├── routes/         # Route React và lazy imports
│   │   ├── utils/          # Định dạng thời gian Việt Nam
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── packages/contracts/     # Schema/DTO dùng chung React và API
├── scripts/                # Setup, build assets, backup/restore
├── tests/                  # E2E desktop/mobile
├── docs/
├── compose.yaml
└── package.json
```

`packages/contracts` được giữ lại để tránh sao chép schema validation giữa frontend/backend. Những lớp không có trách nhiệm trong hệ thống này không được tạo rỗng. Mã đã biên dịch, dependencies, database và media runtime vẫn là dữ liệu bị Git bỏ qua.

## Các đường dẫn thay đổi

- `apps/api` chuyển thành `backend`; `apps/web` chuyển thành `frontend`.
- API router cũ tách thành `routes/*.route.ts` và `controllers/*.controller.ts`; body handler, thứ tự middleware và endpoint được giữ nguyên.
- Cấu hình thành `config/env.ts`, `config/database.ts`; AppError và request types có thư mục riêng.
- CLI tại `backend/scripts/cli.ts`; dữ liệu mẫu tại `backend/prisma/data/demo.ts`.
- Worker Excel nằm cùng parser tại `backend/src/utils`, được copy sang cùng vị trí trong output build.
- Web chia theo các chức năng thực tế; AdminContext tách khỏi layout để component dùng chung mà không phụ thuộc ngược vào trang.

Các lệnh `npm run dev`, `build`, `start`, `test`, `typecheck`, `db:migrate`, `seed`, `admin:create`, `test:e2e` vẫn chạy từ thư mục gốc. Tên workspace `@invite/api`, `@invite/web`, `@invite/contracts` được giữ để không thay giao diện lệnh ngoài yêu cầu.

Các bản đặc tả và kế hoạch cũ trong `docs/superpowers` là lịch sử thiết kế, có thể chứa đường dẫn trước khi tổ chức lại. Tài liệu này và README là cấu trúc hiện hành.
