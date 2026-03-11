#!/bin/bash
# Test Division API Endpoints

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
TOKEN="${TOKEN:-}"

echo "🧪 Testing Division API Endpoints"
echo "Backend URL: $BACKEND_URL"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: GET /api/divisions (List all divisions)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Testing: GET /api/divisions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$TOKEN" ]; then
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions" \
    -H "Authorization: Bearer $TOKEN")
else
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions")
fi

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ SUCCESS${NC} - HTTP $HTTP_CODE"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo -e "${RED}❌ FAILED${NC} - HTTP $HTTP_CODE"
  echo "$BODY"
fi

echo ""

# Test 2: GET /api/divisions/:id (Get specific division)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Testing: GET /api/divisions/:id"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Try to extract first division ID from previous response
DIVISION_ID=$(echo "$BODY" | jq -r '.divisions[0].id' 2>/dev/null)

if [ -n "$DIVISION_ID" ] && [ "$DIVISION_ID" != "null" ]; then
  echo "Using division_id: $DIVISION_ID"
  
  if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions/$DIVISION_ID" \
      -H "Authorization: Bearer $TOKEN")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions/$DIVISION_ID")
  fi
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ SUCCESS${NC} - HTTP $HTTP_CODE"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  else
    echo -e "${RED}❌ FAILED${NC} - HTTP $HTTP_CODE"
    echo "$BODY"
  fi
else
  echo -e "${YELLOW}⚠️  SKIPPED${NC} - No division ID found from previous test"
fi

echo ""

# Test 3: GET /api/divisions/:id/task-summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Testing: GET /api/divisions/:id/task-summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$DIVISION_ID" ] && [ "$DIVISION_ID" != "null" ]; then
  if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions/$DIVISION_ID/task-summary" \
      -H "Authorization: Bearer $TOKEN")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions/$DIVISION_ID/task-summary")
  fi
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ SUCCESS${NC} - HTTP $HTTP_CODE"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  else
    echo -e "${RED}❌ FAILED${NC} - HTTP $HTTP_CODE"
    echo "$BODY"
  fi
else
  echo -e "${YELLOW}⚠️  SKIPPED${NC} - No division ID"
fi

echo ""

# Test 4: GET /api/divisions/:id/projects-overview
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Testing: GET /api/divisions/:id/projects-overview"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "$DIVISION_ID" ] && [ "$DIVISION_ID" != "null" ]; then
  if [ -n "$TOKEN" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions/$DIVISION_ID/projects-overview" \
      -H "Authorization: Bearer $TOKEN")
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/divisions/$DIVISION_ID/projects-overview")
  fi
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ SUCCESS${NC} - HTTP $HTTP_CODE"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  else
    echo -e "${RED}❌ FAILED${NC} - HTTP $HTTP_CODE"
    echo "$BODY"
  fi
else
  echo -e "${YELLOW}⚠️  SKIPPED${NC} - No division ID"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Tests completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
