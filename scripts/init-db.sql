-- Initialize PaaS Database
-- This file is executed when PostgreSQL container starts

-- Create database if it doesn't exist (PostgreSQL will create it from POSTGRES_DB env var)
-- Additional initialization can be added here

-- Set timezone
SET timezone = 'UTC';

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'PaaS Database initialized successfully';
END $$;