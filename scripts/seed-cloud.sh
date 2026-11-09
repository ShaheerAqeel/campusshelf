#!/bin/bash
# Load demo data into RDS by running the seed script inside a running app container (via SSM Run Command).
# Usage: SEED_DEMO_PASSWORD=yourDemoPass ./scripts/seed-cloud.sh
set -euo pipefail
: "${SEED_DEMO_PASSWORD:?Set SEED_DEMO_PASSWORD}"
ID=$(aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=campusshelf-app" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
CMD_ID=$(aws ssm send-command --instance-ids "$ID" --document-name AWS-RunShellScript \
  --parameters "commands=[\"docker exec -e SEED_DEMO_PASSWORD='$SEED_DEMO_PASSWORD' api node src/seed.js\"]" \
  --query Command.CommandId --output text)
sleep 8
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$ID" \
  --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
