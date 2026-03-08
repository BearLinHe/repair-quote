# 维修登记/报价系统 MVP

Next.js (App Router) + TypeScript + Neon Postgres + Clerk + Prisma.

## 技术栈

- **Next.js** 最新稳定版，App Router，TypeScript
- **UI**: shadcn/ui 风格组件 + Tailwind CSS
- **Auth**: Clerk（所有业务页面与 API 需登录）
- **DB**: Neon Postgres + Prisma ORM
- **PDF**: 服务端 pdf-lib 生成，含签字栏

金额存库单位：分（integer cents）；税率/比例：basis points (bps)。

## 项目结构

```
repair-quote/
├── prisma/
│   ├── schema.prisma    # 数据模型
│   └── seed.ts          # 初始化 settings 单行
├── src/
│   ├── app/
│   │   ├── api/cases/           # GET/POST 列表与创建
│   │   │   └── [id]/
│   │   │       ├── route.ts     # GET 详情
│   │   │       ├── repair-items/route.ts
│   │   │       ├── parts/route.ts
│   │   │       ├── labor/route.ts
│   │   │       ├── status/route.ts
│   │   │       ├── pdf/route.ts
│   │   │       └── history/route.ts  # 历史名称下拉
│   │   ├── cases/
│   │   │   ├── new/page.tsx     # Check-in 新建
│   │   │   └── [id]/page.tsx    # 详情 + case-detail.tsx
│   │   ├── dashboard/           # 列表 + 搜索 + New Case
│   │   ├── sign-in/[[...sign-in]]/
│   │   ├── sign-up/[[...sign-up]]/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/ui/           # Button, Input, Label, Tabs, Select, Card
│   ├── lib/
│   │   ├── auth.ts      # requireAuth / getAuthUserId
│   │   ├── db.ts        # Prisma 单例
│   │   ├── recalc.ts    # recalcTotals(caseId)
│   │   ├── pdf.ts       # generateCasePdf
│   │   └── utils.ts
│   └── middleware.ts    # Clerk 保护 /dashboard、/cases
├── .env.example
├── package.json
└── README.md
```

## 环境变量

复制 `.env.example` 为 `.env`，填写：

- `DATABASE_URL`: Neon Postgres 连接串（可带 ?sslmode=require）
- `DIRECT_URL`: 同上（Neon 迁移用，可与 DATABASE_URL 相同）
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## 运行步骤

1. 复制 `.env.example` 为 `.env`，并填写 Neon 的 `DATABASE_URL`、`DIRECT_URL`。Clerk 支持 **keyless 模式**：不设置 Clerk 密钥时，Clerk 会自动生成临时密钥，可直接开发、注册/登录测试用户；需要正式部署时再到 [Clerk Dashboard](https://dashboard.clerk.com) 领取应用并配置密钥。

```bash
# 安装依赖（若用 pnpm：pnpm install）
npm install

# 生成 Prisma Client
npx prisma generate

# 数据库迁移（会创建所有表）
npx prisma migrate dev --name init

# 初始化系统配置（settings 单行：清洁费 10%/上限 $200，税率 10.75%）
npx tsx prisma/seed.ts

# 开发
npm run dev
```

生产构建：`npm run build` 时若使用 keyless 模式可能在某些环境下需配置 Clerk 密钥；部署到生产时建议在 Dashboard 领取应用并设置 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 与 `CLERK_SECRET_KEY`。

浏览器打开 `http://localhost:3000`，会重定向到 `/dashboard`；未登录会进入 Clerk 登录页。登录后可在 Dashboard 新建 Case，在详情页维护项目/配件/人工、改状态、生成 PDF。

## 部署

- 在 Vercel 等平台配置 `DATABASE_URL`、`DIRECT_URL`、Clerk 密钥。
- 部署前执行 `npx prisma migrate deploy`（或平台 build 前执行）。
- 部署后可选执行一次 seed：`npx tsx prisma/seed.ts`（若库中尚无 settings）。

## API 一览

| 方法 | 路径 | 说明 |
|-----|------|------|
| GET | /api/cases?query= | 我的 cases 列表，可选搜索 plate/vin/unit_number |
| POST | /api/cases | 创建 case（至少 plate/vin/unit_number 之一） |
| GET | /api/cases/[id] | 详情 |
| GET | /api/cases/[id]/history | 历史项目/配件/人工名称（下拉用） |
| POST/PUT/DELETE | /api/cases/[id]/repair-items | 维修项目 |
| POST/PUT/DELETE | /api/cases/[id]/parts | 配件 |
| POST/PUT/DELETE | /api/cases/[id]/labor | 人工 |
| POST | /api/cases/[id]/status | 状态变更 { to_status, note? } |
| GET | /api/cases/[id]/pdf | 生成并下载 PDF |

所有 API 均校验 Clerk 登录且仅允许操作当前用户的 case。
