# Database Migration Checklist

Before running migrations, complete all pre-flight checks:

## Pre-Migration Checks
- [ ] Backup production PostgreSQL database
- [ ] Verify all services are stopped (except database)
- [ ] Check disk space (at least 1GB free)
- [ ] Verify Prisma is at version 6.19.3 or compatible
- [ ] Run `npm run prisma:validate` - schema is valid
- [ ] Review migration file: `prisma/migrations/add_subscription_features.sql`
- [ ] Test migration on staging environment first

## Migration Steps

### Step 1: Generate Prisma Client
```bash
npm run prisma:generate
# or
npx prisma generate
```
**Expected:** No errors, client regenerated with new types

### Step 2: Review Migration File
```bash
cat prisma/migrations/add_subscription_features.sql
```
**Expected:** Shows:
- ALTER TABLE subscriptions (add 9 new columns)
- CREATE TABLE artist_cards
- CREATE TABLE beat_purchases
- CREATE TABLE distribution_queue_entries
- CREATE TABLE distribution_queue_logs
- CREATE TABLE indices

### Step 3: Test Migration (Staging Only)
```bash
# In staging environment
npx prisma migrate dev --name add_subscription_features_test

# Verify tables created
psql $DATABASE_URL -c "\dt"
```
**Expected:** All new tables visible, no errors

### Step 4: Production Migration
```bash
# In production
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```
**Expected:** All migrations applied successfully

### Step 5: Verify Schema
```bash
# Connect to database and verify
psql $DATABASE_URL <<EOF
-- Check subscriptions table
\d subscriptions

-- Check new tables exist
SELECT tablename FROM pg_tables 
WHERE tablename IN (
  'artist_cards', 
  'beat_purchases', 
  'distribution_queue_entries', 
  'distribution_queue_logs'
);
EOF
```

**Expected:**
```
                     tablename                      
────────────────────────────────────────────────────
 artist_cards
 beat_purchases
 distribution_queue_entries
 distribution_queue_logs
```

### Step 6: Test Database Functions
```bash
# Verify subscription functions work
npm run test:db-functions

# Test queries
npm run prisma:db:query
```

**Expected:** No errors, subscriptions can be queried

## Post-Migration Validation

### Data Integrity Checks
- [ ] All existing subscriptions still visible
- [ ] No existing user data modified
- [ ] Foreign key constraints working
- [ ] Indices created successfully
- [ ] Database queries performant

### Application Tests
- [ ] Subscription dashboard loads
- [ ] Payment requirement checker works
- [ ] Beat purchases queryable
- [ ] Queue entries creatable
- [ ] No TypeScript errors

### Performance Checks
```bash
# Check query performance
EXPLAIN ANALYZE SELECT * FROM subscriptions WHERE user_id = 1;
EXPLAIN ANALYZE SELECT * FROM artist_cards WHERE user_id = 1;
```

**Expected:** Index used, reasonable query times (<10ms)

## Rollback Procedure (If Needed)

### Immediate Rollback
If critical errors occur:
```bash
# Step 1: Stop application
docker-compose down
# or
systemctl stop hymn-platform

# Step 2: Restore from backup
pg_restore --verbose -d hymn_prod < backup_before_migration.sql

# Step 3: Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM subscriptions;"

# Step 4: Restart application with previous code version
git checkout previous-tag
npm ci
npm run build
docker-compose up
```

### Partial Rollback
If only some features have issues:
```bash
# Rollback migration while keeping old code
npx prisma migrate resolve --rolled-back add_subscription_features

# Keep application running
# New components won't work, but old features unaffected
```

## Troubleshooting

### Issue: Migration Fails with "Permission denied"
```bash
# Solution: Check PostgreSQL user permissions
psql $DATABASE_URL -c "GRANT ALL PRIVILEGES ON DATABASE hymn_prod TO postgres;"
```

### Issue: Tables Already Exist
```bash
# Solution: Migration already applied
npx prisma migrate status
# Should show as "applied"

# If stuck, resolve it
npx prisma migrate resolve --applied add_subscription_features
```

### Issue: Type Errors After Migration
```bash
# Solution: Regenerate Prisma client
npm run prisma:generate
# Clear node_modules cache
rm -rf .next
npm run build
```

### Issue: Foreign Key Constraint Violation
```bash
# Solution: Check data consistency
SELECT COUNT(*) FROM subscriptions WHERE user_id NOT IN (SELECT id FROM users);

# If orphaned records found, delete them
DELETE FROM subscriptions 
WHERE user_id NOT IN (SELECT id FROM users);
```

## Verification Commands

```bash
# 1. Verify all migrations applied
npx prisma migrate status

# 2. Check table structure
psql $DATABASE_URL -c "\d subscriptions"
psql $DATABASE_URL -c "\d artist_cards"
psql $DATABASE_URL -c "\d beat_purchases"
psql $DATABASE_URL -c "\d distribution_queue_entries"

# 3. Verify indices
psql $DATABASE_URL -c "SELECT schemaname, tablename, indexname FROM pg_indexes WHERE tablename IN ('subscriptions', 'artist_cards', 'beat_purchases', 'distribution_queue_entries');"

# 4. Test query performance
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM subscriptions LIMIT 1;"

# 5. Verify data integrity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM subscriptions;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM artist_cards;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM beat_purchases;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM distribution_queue_entries;"
```

## Success Criteria

✅ Migration Complete When:
- All migration files applied successfully
- No TypeScript errors in application
- Subscription dashboard loads
- Payment requirement checker works
- Database queries are responsive
- All existing features still functional
- No performance degradation
- Backup available for rollback

## Notes for DevOps Team

- Migration time: ~5-10 seconds for typical database size
- Lock time: <1 second (minimal downtime impact)
- Rollback time: ~30 seconds if needed
- No application changes needed (backward compatible)
- All new features are opt-in via API calls
