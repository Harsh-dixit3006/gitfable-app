#!/bin/sh

echo "=========================================="
echo "GitFable Test Runner"
echo "=========================================="

# Wait for database
echo "Waiting for database..."
until pg_isready -h postgres -p 5432 -U gitfable -d gitfable_test 2>/dev/null; do
  echo "  Database is unavailable - sleeping..."
  sleep 1
done
echo "✓ Database is ready!"

# Wait for Redis
echo "Waiting for Redis..."
until nc -z redis 6379 2>/dev/null; do
  echo "  Redis is unavailable - sleeping..."
  sleep 1
done
echo "✓ Redis is ready!"

# Run database migrations
echo ""
echo "Running database migrations..."
cd /app
# Check if migrations directory exists and run migrations
if [ -d "sql/migrations" ]; then
  echo "Found migrations directory, running migrations..."
  # Try to install migrate tool if not present
  if ! command -v migrate &> /dev/null; then
    echo "Installing migrate tool..."
    go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest || echo "Warning: Could not install migrate tool"
  fi
  
  # Run migrations if migrate tool is available
  if command -v migrate &> /dev/null; then
    migrate -path sql/migrations -database "$DATABASE_URL" up || echo "Warning: Migrations failed or already applied"
  else
    echo "Warning: migrate tool not available, skipping migrations"
  fi
else
  echo "Warning: No migrations directory found"
fi

echo ""
echo "Running tests..."
echo "=========================================="

# Determine which tests to run
TEST_PATTERN=${TEST_PATTERN:-"./..."}
TEST_FLAGS=${TEST_FLAGS:-"-v"}

echo "Test pattern: $TEST_PATTERN"
echo "Test flags: $TEST_FLAGS"
echo ""

# Run tests
go test $TEST_PATTERN $TEST_FLAGS -count=1 2>&1

TEST_EXIT_CODE=$?

echo ""
echo "=========================================="
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✓ All tests passed!"
else
  echo "✗ Some tests failed (exit code: $TEST_EXIT_CODE)"
fi
echo "=========================================="

exit $TEST_EXIT_CODE
