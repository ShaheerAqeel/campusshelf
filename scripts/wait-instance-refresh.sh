#!/bin/bash
# Start an ASG instance refresh and wait for it to finish.
# New instances read /campusshelf/image_tag at boot, so a refresh = a deployment.
# Usage: wait-instance-refresh.sh <asg-name>
set -euo pipefail
ASG="$1"

ID=$(aws autoscaling start-instance-refresh --auto-scaling-group-name "$ASG" \
  --preferences '{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":180}' \
  --query InstanceRefreshId --output text)
echo "Instance refresh $ID started on $ASG"

for _ in $(seq 1 60); do   # up to 20 minutes
  read -r STATUS PCT < <(aws autoscaling describe-instance-refreshes --auto-scaling-group-name "$ASG" \
    --instance-refresh-ids "$ID" --query 'InstanceRefreshes[0].[Status,PercentageComplete]' --output text)
  echo "$(date -u +%H:%M:%S) $ASG: $STATUS ${PCT}%"
  case "$STATUS" in
    Successful) exit 0 ;;
    Failed|Cancelled|RollbackSuccessful|RollbackFailed) exit 1 ;;
  esac
  sleep 20
done
echo "Timed out waiting for $ASG" >&2
exit 1
