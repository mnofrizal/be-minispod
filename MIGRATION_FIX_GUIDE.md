# Fix Prisma Migration Issue - Subscription Upgrade Tables

## Problem

The migration `20250126_add_subscription_upgrade_tables` is failing because it references existing tables that don't exist in the shadow database.

## Solution Options

### Option 1: Reset and Regenerate Migration (Recommended for Development)

If you're in development and can afford to lose data:

```bash
# 1. Reset the database and migrations
npx prisma migrate reset

# 2. Generate a new migration that includes all changes
npx prisma migrate dev --name add_subscription_upgrade_tables

# 3. Generate Prisma client
npx prisma generate

# 4. Seed the database (if you have seed data)
npx prisma db seed
```

### Option 2: Fix the Existing Migration (Production Safe)

If you need to preserve existing data:

```bash
# 1. Delete the problematic migration folder
rm -rf prisma/migrations/20250126_add_subscription_upgrade_tables

# 2. Generate a new migration from schema changes
npx prisma migrate dev --name add_subscription_upgrade_tables

# 3. Generate Prisma client
npx prisma generate
```

### Option 3: Manual Database Update (Advanced)

If you want to apply changes manually:

```bash
# 1. Mark the migration as applied without running it
npx prisma migrate resolve --applied 20250126_add_subscription_upgrade_tables

# 2. Apply the SQL manually to your database
psql -d paas_db -f prisma/migrations/20250126_add_subscription_upgrade_tables/migration.sql

# 3. Generate Prisma client
npx prisma generate
```

## Recommended Steps for Your Case

Since you're in development, I recommend **Option 1**:

```bash
# Step 1: Reset everything
npx prisma migrate reset

# Step 2: This will recreate all tables including the new upgrade tables
npx prisma migrate dev --name complete_schema_with_upgrades

# Step 3: Generate client
npx prisma generate

# Step 4: Seed database with test data
npx prisma db seed
```

## What This Will Do

1. **Drop all existing tables** and recreate them from scratch
2. **Create a single migration** that includes all your schema changes
3. **Generate the Prisma client** with the new models
4. **Seed the database** with fresh test data

## Verify the Fix

After running the migration, verify it worked:

```bash
# Check migration status
npx prisma migrate status

# Check that new tables exist
npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%subscription%';"
```

You should see:

- `subscriptions`
- `subscription_plan_changes`
- `prorated_calculations`

## Alternative: Use Prisma Studio

You can also verify the schema using Prisma Studio:

```bash
npx prisma studio
```

This will open a web interface where you can see all your tables and data.

## Important Notes

- **Backup your data** if you have important information before running `migrate reset`
- The reset will **delete all existing data** in your database
- After reset, you'll need to **re-seed** your database with test data
- Make sure your `.env` file has the correct `DATABASE_URL`

## If You Get Permission Errors

If you get permission errors, make sure:

1. PostgreSQL is running
2. Database exists: `createdb paas_db` (if needed)
3. User has proper permissions
4. Connection string in `.env` is correct

## Test the Upgrade Functionality

After migration is successful, test the upgrade endpoints:

```bash
# Test upgrade options endpoint
curl -X GET "http://localhost:3000/api/v1/subscriptions/{subscription-id}/upgrade-options" \
  -H "Authorization: Bearer {your-token}"

# Test upgrade validation
curl -X POST "http://localhost:3000/api/v1/subscriptions/{subscription-id}/validate-upgrade" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {your-token}" \
  -d '{"newServiceId": "{service-id}"}'
```

The upgrade system should now work without validation or migration errors.
