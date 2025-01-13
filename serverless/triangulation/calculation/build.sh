#!/bin/bash
set -e

# Build the Docker image
docker build -t triangulation-lambda .

# Get the AWS account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --profile rix-admin-chris --query Account --output text)
AWS_REGION="us-east-1"  # adjust if needed
ECR_REPO="triangulation-lambda"

# Authenticate Docker to ECR
aws ecr get-login-password --region ${AWS_REGION} --profile rix-admin-chris | docker login --username AWS --password-stdin ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Create repository if it doesn't exist (redirecting output to /dev/null)
aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${AWS_REGION} --profile rix-admin-chris > /dev/null 2>&1 || \
    aws ecr create-repository --repository-name ${ECR_REPO} --region ${AWS_REGION} --profile rix-admin-chris --force-deletion true

# Tag and push the image (docker commands are already non-interactive)
docker tag triangulation-lambda:latest ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest
docker push ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest
