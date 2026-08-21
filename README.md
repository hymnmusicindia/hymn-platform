# HYMN Music Distribution Platform

Enterprise-grade Next.js platform for HYMN Music with Google-only authentication, role-based dashboards, release workflows, producer approvals, analytics surfaces, payments, audit logs, and secure upload architecture.

## Stack

- Next.js 15 App Router, TypeScript, Tailwind CSS, Framer Motion-ready UI layer
- PostgreSQL with Prisma ORM for production
- Google OAuth 2.0 identity, secure HTTP-only JWT cookies, persisted session records
- Middleware route/API protection for customer, producer, and admin roles
- Razorpay payment integration and local/cloud-ready upload abstraction

## Auth And Roles

HYMN uses Google as the only login provider. Email/password UI has been removed from the user-facing login flow.

- Artists/customers: `/dashboard` or `/dashboard/customer`
- Producers: `/producer/dashboard`
- Admin/master users: `/admin`
- Admin access is granted by adding the Google account email to `ADMIN_GOOGLE_EMAILS`.

Unauthenticated dashboard requests are redirected to `/login`. Authenticated users with the wrong role are sent to `/access-denied`; API routes return `401` or `403`.

## Database

Production schema lives in [`prisma/schema.prisma`](/d:/HYMN%20WEBSITE%20AI/HYMN%20website/prisma/schema.prisma) and covers:

- users, sessions, producer_applications
- releases, tracks, uploads, analytics
- royalties, payouts, notifications
- support_tickets and audit_logs

Generate Prisma Client:

```bash
npm run db:generate
```

Push schema to a provisioned PostgreSQL database:

```bash
npm run db:push
```

## Run

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, and `ADMIN_GOOGLE_EMAILS`.
3. Install and generate:

```bash
npm install
npm run db:generate
```

4. Start development:

```bash
npm run dev
```

5. Build production:

```bash
npm run build
npm start
```

## Vercel deployment

Set the following values in Vercel Project Settings → Environment Variables for
Production (and Preview only when using a non-production integration account):

- `DATABASE_URL` — pooled PostgreSQL production connection.
- `JWT_SECRET`, `ADMIN_JWT_SECRET`, `CRON_SECRET`, and `PAYOUT_ENCRYPTION_KEY` — distinct high-entropy secrets.
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `PUBLIC_SITE_URL`, and `APP_URL` — the canonical HTTPS application URL.
- Google, Razorpay, storage, email, and Spotify values required by the enabled features.
- `DIRENOTE_CLIENT_ID` and `DIRENOTE_API_PIN` — server-only DireNote credentials.
- Optional DireNote endpoint overrides only when supplied by DireNote; the documented v2.2 defaults are already configured.
- `DIRENOTE_RELEASE_SYNC_ENABLED=true`; enable revenue only after finance approval with `DIRENOTE_REVENUE_SYNC_ENABLED=true` and a valid `DIRENOTE_REVENUE_SYNC_ACTOR_ID`.

`vercel.json` schedules the release-status sync daily and the revenue sync on
the second day of each month. Vercel supplies `CRON_SECRET` to protected cron
requests when that project variable is configured. The repository's
`vercel-build` command applies versioned Prisma migrations only for Production
deployments before building; Preview deployments never run migrations.

## UI Previews

- Submitted and resubmitted release confirmation: [http://localhost:3000/release-submitted-preview](http://localhost:3000/release-submitted-preview)

## Notes

The legacy MySQL/memory adapter remains for older local HYMN data, but any PostgreSQL `DATABASE_URL` switches core identity, sessions, producer applications, notifications, and audit logs to Prisma.
