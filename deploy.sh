#!/bin/bash
set -e

# Configuration
AWS_REGION=${AWS_REGION:-"ap-south-1"}
APP_NAME=${APP_NAME:-"physioguard"}
IMAGE_TAG=${IMAGE_TAG:-"latest"}

echo "=== PhysioGuard AWS Deployment Script ==="

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "ERROR: AWS CLI not installed"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker not installed"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "ERROR: Terraform not installed"; exit 1; }

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${APP_NAME}"

echo "AWS Account ID: ${AWS_ACCOUNT_ID}"
echo "ECR URL: ${ECR_URL}"
echo "Region: ${AWS_REGION}"
echo ""

# Authenticate to ECR
echo ">>> Authenticating to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Build Docker image
echo ">>> Building Docker image..."
cd "$(dirname "$0")"
docker build -t "${APP_NAME}:${IMAGE_TAG}" .

# Tag for ECR
echo ">>> Tagging image..."
docker tag "${APP_NAME}:${IMAGE_TAG}" "${ECR_URL}:${IMAGE_TAG}"
docker tag "${APP_NAME}:${IMAGE_TAG}" "${ECR_URL}:$(date +%Y%m%d-%H%M%S)"

# Push to ECR
echo ">>> Pushing to ECR..."
docker push "${ECR_URL}:${IMAGE_TAG}"

# Get ECS cluster and service names from Terraform
ECS_CLUSTER=$(cd terraform && terraform output -raw ecs_cluster_name 2>/dev/null || echo "${APP_NAME}-cluster")
ECS_SERVICE=$(cd terraform && terraform output -raw ecs_service_name 2>/dev/null || echo "${APP_NAME}-service")

# Update ECS service
echo ">>> Deploying to ECS..."
aws ecs update-service \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --force-new-deployment \
  --region "${AWS_REGION}" \
  --output text

# Wait for deployment
echo ">>> Waiting for deployment to complete..."
aws ecs wait services-stable \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}" \
  --region "${AWS_REGION}"

echo ""
echo "=== Deployment Complete! ==="
ALB_DNS=$(cd terraform && terraform output -raw alb_dns_name 2>/dev/null || echo "check AWS console")
echo "Application URL: http://${ALB_DNS}"
