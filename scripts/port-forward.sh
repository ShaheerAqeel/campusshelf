#!/bin/bash
# Reach the private stack without an ALB, through SSM Session Manager (free, no SSH, no public IP).
#   ./scripts/port-forward.sh web   -> http://localhost:8080 (the full app via a web instance)
#   ./scripts/port-forward.sh db    -> localhost:15432 (PostgreSQL via an app instance)
# Needs the Session Manager plugin for the AWS CLI.
set -euo pipefail
first_instance() {
  aws ec2 describe-instances \
    --filters "Name=tag:aws:autoscaling:groupName,Values=$1" "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text
}
case "${1:-web}" in
  web)
    ID=$(first_instance campusshelf-web)
    echo "Forwarding localhost:8080 -> $ID:80 (Ctrl+C to stop)"
    aws ssm start-session --target "$ID" --document-name AWS-StartPortForwardingSession \
      --parameters '{"portNumber":["80"],"localPortNumber":["8080"]}' ;;
  db)
    ID=$(first_instance campusshelf-app)
    HOST=$(aws rds describe-db-instances --db-instance-identifier campusshelf-db --query 'DBInstances[0].Endpoint.Address' --output text)
    echo "Forwarding localhost:15432 -> $HOST:5432 via $ID (Ctrl+C to stop)"
    echo "Password: aws ssm get-parameter --name /campusshelf/db_password --with-decryption --query Parameter.Value --output text"
    aws ssm start-session --target "$ID" --document-name AWS-StartPortForwardingSessionToRemoteHost \
      --parameters "{\"host\":[\"$HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"15432\"]}" ;;
  *) echo "usage: $0 web|db" >&2; exit 1 ;;
esac
