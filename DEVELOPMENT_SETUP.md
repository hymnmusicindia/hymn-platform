# Development Setup & Environment Guide

## Prerequisites
- Node.js 18+ (Current: 20.x recommended)
- PostgreSQL 14+ with URL in `DATABASE_URL` env var
- Prisma CLI installed: `npm install -g @prisma/cli`
- TypeScript 5.8.3+
- React 19.1.0+

## Environment Variables

Add these to your `.env.local` file:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hymn_prod"

# Razorpay (existing)
RAZORPAY_KEY_ID="your_key_id"
RAZORPAY_KEY_SECRET="your_secret"

# Google OAuth (existing)
GOOGLE_CLIENT_ID="your_client_id"
GOOGLE_CLIENT_SECRET="your_secret"

# New: Subscription system
SUBSCRIPTION_ENABLED=true
SUBSCRIPTION_TAX_RATE=0.18  # GST in India

# New: Distribution queue
DISTRIBUTION_QUEUE_ENABLED=true
DIRENOTE_API_KEY="your_direnote_key"  # When integrating with DireNote

# New: Beat store
BEAT_STORE_ENABLED=true
MAX_BEAT_UPLOAD_SIZE_MB=50
```

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

Verify Prisma version:
```bash
npm list @prisma/client
# Should show @prisma/client@6.19.3 or compatible
```

### 2. Generate Prisma Client
```bash
npm run prisma:generate
# or
npx prisma generate
```

This generates types and database client from schema.

### 3. Run Database Migrations (Dev Only)
```bash
npm run prisma:migrate:dev
# or
npx prisma migrate dev

# When prompted, name the migration: "add_subscription_features"
```

For production, use:
```bash
npx prisma migrate deploy
```

### 4. Seed Database (Optional)
```bash
npm run prisma:seed
# Creates test data for development
```

### 5. Start Development Server
```bash
npm run dev
# or
npm run dev:watch
```

Visit `http://localhost:3000`

## Project Structure

```
hymn-platform/
├── app/                          # Next.js app directory
│   ├── api/                      # API endpoints
│   │   ├── subscriptions/        # NEW: Subscription management
│   │   ├── beat-purchases/       # NEW: Beat purchase flow
│   │   ├── releases/             # Release-related endpoints
│   │   └── distribution-queue/   # NEW: Queue tracking
│   ├── distribution/             # Distribution portal
│   ├── beat-store/               # Beat store pages
│   ├── dashboard/                # User dashboard
│   ├── admin/                    # Admin panel
│   └── globals.css              # UPDATED: Improved light theme
│
├── components/                   # React components
│   ├── subscription-dashboard.tsx         # NEW
│   ├── payment-requirement-checker.tsx   # NEW
│   ├── distribution-queue-dashboard.tsx  # NEW
│   ├── beat-store-filter.tsx             # NEW
│   ├── improved-beat-card.tsx            # NEW
│   ├── release-form.tsx                  # NEEDS INTEGRATION
│   ├── beat-store-experience.tsx         # NEEDS INTEGRATION
│   └── ...
│
├── lib/                          # Utilities and helpers
│   ├── db.ts                     # UPDATED: Database functions
│   ├── types.ts                  # UPDATED: Type definitions
│   ├── distribution-plans.ts     # UPDATED: Plan configuration
│   ├── subscription-helpers.ts   # NEW
│   ├── schema-validation.ts      # NEW
│   ├── distribution-service.ts   # Existing
│   └── ...
│
├── prisma/
│   ├── schema.prisma             # UPDATED: Extended schema
│   └── migrations/
│       └── add_subscription_features.sql  # NEW
│
├── IMPLEMENTATION_GUIDE.md       # NEW: Full integration guide
├── MIGRATION_CHECKLIST.md        # NEW: Database migration steps
└── package.json
```

## Key File Locations

### Database Schema
- **Schema Definition:** `prisma/schema.prisma`
- **Migration File:** `prisma/migrations/add_subscription_features.sql`
- **Generated Types:** `node_modules/.prisma/client/index.d.ts`

### Type Definitions
- **Main Types:** `lib/types.ts`
- **Plan Configuration:** `lib/distribution-plans.ts`
- **Validation:** `lib/schema-validation.ts`

### Database Layer
- **All DB Functions:** `lib/db.ts`
- **Subscription Functions:** Lines ~450-550
- **Artist Card Functions:** Lines ~550-600
- **Beat Purchase Functions:** Lines ~600-700
- **Validation Functions:** `lib/schema-validation.ts`

### Components
- **Subscription Display:** `components/subscription-dashboard.tsx`
- **Payment Check:** `components/payment-requirement-checker.tsx`
- **Queue Tracking:** `components/distribution-queue-dashboard.tsx`
- **Beat Filtering:** `components/beat-store-filter.tsx`
- **Beat Cards:** `components/improved-beat-card.tsx`

### API Endpoints
- **Subscription CRUD:** `app/api/subscriptions/create/route.ts`
- **Subscription Mgmt:** `app/api/subscriptions/manage/route.ts`
- **Payment Check:** `app/api/releases/check-payment-requirement/route.ts`
- **Beat Purchases:** `app/api/beat-purchases/route.ts`
- **Distribution Queue:** `app/api/distribution-queue/route.ts`

## Common Development Tasks

### Add a New Subscription Plan
1. Update `lib/distribution-plans.ts` - Add plan config
2. Update `prisma/schema.prisma` - Add enum value if needed
3. Update `lib/types.ts` - Update DistributionPlan type
4. Regenerate Prisma: `npm run prisma:generate`
5. Update tests

### Create a Subscriber Release
```typescript
// Check subscription status
const sub = await getSubscriptionByUserId(userId);
if (sub?.status === "active" && sub.daysRemaining > 0) {
  // Bypass payment - submit directly
} else {
  // Require payment
}
```

### Track Release in Queue
```typescript
// When release submitted
await db.distributionQueueEntry.create({
  data: {
    userId,
    releaseId,
    releaseName,
    currentStage: "draft_submitted",
    submittedAt: new Date()
  }
});
```

### Handle Beat Purchase
```typescript
// 1. Create purchase record
const purchase = await createBeatPurchase(userId, beatId, "premium");

// 2. Process payment (existing Razorpay flow)

// 3. Store license URL after payment
await uploadBeatLicense(purchase.id, licenseUrl);
```

## Testing

### Unit Tests
```bash
npm run test
npm run test:watch  # Watch mode
```

### Integration Tests
```bash
npm run test:integration
```

### Database Tests
```bash
npm run test:db-functions
```

### Type Check
```bash
npm run type-check
```

## Debugging

### Enable Detailed Logs
```bash
DEBUG=prisma:* npm run dev
```

### Query Database Directly
```bash
npm run prisma:studio
# Opens Prisma Studio at http://localhost:5555
```

### Database Inspection
```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# View subscriptions
SELECT id, user_id, plan, status, days_remaining FROM subscriptions;

# View artist cards
SELECT id, user_id, artist_name FROM artist_cards;

# View beat purchases
SELECT id, user_id, beat_id, license_type, has_access FROM beat_purchases;

# View queue entries
SELECT id, release_id, current_stage, submitted_at FROM distribution_queue_entries;
```

### Check Prisma Health
```bash
npx prisma db execute --stdin
# Type SQL commands

SELECT version();  # PostgreSQL version
SELECT current_user;  # Current user
```

## Performance Tips

### Optimize Database Queries
```typescript
// ✅ Good: Use include to fetch related data
const subscription = await getSubscriptionByUserId(userId);

// ❌ Avoid: Multiple queries in loop
for (const entry of entries) {
  const user = await findUserById(entry.userId);  // N+1 problem
}

// ✅ Good: Batch queries
const entries = await db.distributionQueueEntry.findMany({
  where: { currentStage: "draft_submitted" },
  include: { user: true }  // Single query with join
});
```

### Index Lookups
All frequently queried columns have indices:
- `subscriptions(user_id)`
- `artist_cards(user_id)`
- `beat_purchases(user_id)`
- `distribution_queue_entries(user_id, current_stage)`

## Troubleshooting

### "PrismaClientValidationError"
```bash
# Regenerate Prisma client
npm run prisma:generate
rm -rf node_modules/.prisma
npm install
```

### "Cannot find module '@prisma/client'"
```bash
npm install @prisma/client@6.19.3
```

### "Database connection failed"
```bash
# Check DATABASE_URL
echo $DATABASE_URL

# Test connection
npx prisma db execute --stdin
SELECT 1;
```

### "Type not found"
```bash
# Regenerate types
npm run prisma:generate

# Clear TypeScript cache
rm -rf .next
npm run build
```

## Version Management

Current versions (must match):
- `@prisma/client`: 6.19.3
- `typescript`: 5.8.3
- `react`: 19.1.0
- `next`: 15.5.14

To update dependencies:
```bash
npm update @prisma/client  # Don't update major versions without testing
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-database
```

## Documentation Files

- **IMPLEMENTATION_GUIDE.md** - Full integration instructions
- **MIGRATION_CHECKLIST.md** - Database migration steps
- **This file** - Development environment setup

## Quick Reference

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run linter

# Prisma
npm run prisma:generate   # Regenerate client
npm run prisma:migrate:dev  # Create new migration
npm run prisma:studio     # Open database GUI
npm run prisma:seed       # Seed test data

# Testing
npm run test         # Run tests
npm run test:watch   # Watch mode

# Database
npm run db:push      # Push schema without migration
npm run db:reset     # Reset database (dev only!)

# Type checking
npm run type-check   # Check TypeScript types
```

## Support

For issues:
1. Check IMPLEMENTATION_GUIDE.md
2. Review error messages and logs
3. Check `lib/schema-validation.ts` for validation issues
4. Verify database migration status: `npx prisma migrate status`
5. Check Prisma documentation: https://www.prisma.io/docs/
