#!/bin/bash
# Wake the stack: start RDS (if stopped), start the NAT instance, scale both ASGs to min 1.
# Usage: ./scripts/session-up.sh              (no ALB, use SSM port forwarding)
#        ./scripts/session-up.sh --alb        (also create the public ALB)
set -euo pipefail
cd "$(dirname "$0")/../infrastructure"

ALB=false
[ "${1:-}" = "--alb" ] && ALB=true

DB=campusshelf-db
STATUS=$(aws rds describe-db-instances --db-instance-identifier "$DB" \
  --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo "missing")
if [ "$STATUS" = "stopped" ]; then
  echo "Starting RDS..."
  aws rds start-db-instance --db-instance-identifier "$DB" >/dev/null
fi
if [ "$STATUS" != "missing" ]; then
  aws rds wait db-instance-available --db-instance-identifier "$DB"
fi

terraform apply -var session_active=true -var enable_alb="$ALB"
mkdir -p ../docs
echo "$(date -u +%Y-%m-%dT%H:%MZ) UP   alb=$ALB" >> ../docs/session-log.md
terraform output app_url
