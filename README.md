# SaaS Starter Kit

A production-ready multi-tenant SaaS boilerplate built with NestJS, TypeScript, PostgreSQL, and Prisma.

## Features

- **Authentication** — JWT access tokens (15m) + refresh token rotation
- **Multi-tenancy** — organization workspaces with full data isolation
- **RBAC** — four-tier role system: Owner → Admin → Member → Viewer
- **Invite system** — token-based member invites with expiry
- **Billing stubs** — Stripe-ready plan management (FREE / PRO / ENTERPRISE)
- **Rate limiting** — global throttling via NestJS ThrottlerModule
- **Swagger docs** — auto-generated API docs at `/docs`
- **Docker** — one-command local setup with Docker Compose

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS + TypeScript |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma 7 |
| Auth | JWT + Passport |
| Docs | Swagger / OpenAPI |
| Containerization | Docker + Docker Compose |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A Supabase project (or local PostgreSQL)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/saas-starter-kit.git
cd saas-starter-kit

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Fill in your DATABASE_URL, DIRECT_URL, and JWT secrets

# 4. Run database migrations
npx prisma migrate dev

# 5. Start the dev server
npm run start:dev
```

### One-command Docker setup (local DB)

```bash
docker-compose up -d
```

## API Documentation

Once running, visit:

```
http://localhost:3000/docs
```

## Project Structure

```
src/
├── auth/           # JWT auth, guards, strategies
├── billing/        # Plan management, Stripe webhooks
├── common/         # Shared decorators, filters, interceptors
├── prisma/         # Database service
├── tenants/        # Organizations, invites, members
└── users/          # User profiles, password management
```

## Environment Variables

See `.env.example` for all required variables.

## License

MIT
