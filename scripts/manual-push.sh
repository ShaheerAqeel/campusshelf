#!/bin/bash
# First deployment before CI/CD exists: build both images and push them with tag manual-1
# (the tag Terraform writes to /campusshelf/image_tag). Run from the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:-manual-1}"
REGION="${AWS_REGION:-$(aws configure get region)}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REG="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REG"
# --platform keeps images x86_64 even when built on Apple Silicon
docker build --platform linux/amd64 -t "$REG/campusshelf-api:$TAG" --build-arg APP_VERSION="$TAG" api
docker build --platform linux/amd64 -t "$REG/campusshelf-web:$TAG" --build-arg VITE_API_BASE_URL=/api web
docker push "$REG/campusshelf-api:$TAG"
docker push "$REG/campusshelf-web:$TAG"
echo "Pushed $TAG. If the ASGs are already running, refresh them:"
echo "  scripts/wait-instance-refresh.sh campusshelf-app && scripts/wait-instance-refresh.sh campusshelf-web"
