#!/bin/bash
# Save the SQL INSERT to a file, then pipe to the parser
# The SQL is from user's message - we'll extract it from the session context

# First, let's check if we can run SQL directly via supabase REST API
# Supabase doesn't support raw SQL via REST, but we can use the pg connection

cd /home/ubuntu/.openclaw/workspace/employee-workflow/backend

# Extract DATABASE_URL from .env
source <(grep DATABASE_URL .env | head -1)
echo "DB URL found: ${DATABASE_URL:0:30}..."

# Test connection
echo "SELECT count(*) FROM products;" | timeout 10 psql "$DATABASE_URL" 2>&1 | head -5
