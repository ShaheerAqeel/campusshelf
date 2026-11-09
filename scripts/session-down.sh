#!/bin/bash
# Put the stack to sleep: ASGs to 0, NAT instance stopped, ALB removed.
# RDS keeps running (750 free hours cover one instance 24/7 on the legacy Free Tier).
# Usage: ./scripts/session-down.sh            ./scripts/session-down.sh --stop-db (Free plan: save credits)
set -euo pipefail
cd "$(dirname "$0")/../infrastructure"

terraform apply -var session_active=false -var enable_alb=false

if [ "${1:-}" = "--stop-db" ]; then
  # RDS restarts automatically after 7 days stopped.
  aws rds stop-db-instance --db-instance-identifier campusshelf-db >/dev/null && echo "RDS stopping."
fi
mkdir -p ../docs
echo "$(date -u +%Y-%m-%dT%H:%MZ) DOWN" >> ../docs/session-log.md
