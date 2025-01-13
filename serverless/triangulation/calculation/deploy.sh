#!/bin/bash
export AWS_PROFILE=rix-admin-chris
export CDK_DEFAULT_ACCOUNT=152769399840
export CDK_DEFAULT_REGION=us-east-1

# Install dependencies and build
npm install
rm -rf dist/
npm run build

# Deploy infrastructure
cdk bootstrap
cdk deploy --require-approval never

#arn:aws:lambda:us-east-1:152769399840:function:TriangulationStack-TriangulationFunction7811CDA3-o2SKofCvwBj6
# arn:aws:ecr:us-east-1:152769399840:repository/triangulation-lambda
# Update Lambda function with latest image
aws lambda update-function-code \
  --function-name TriangulationStack-TriangulationFunction7811CDA3-o2SKofCvwBj6 \
  --image-uri ${CDK_DEFAULT_ACCOUNT}.dkr.ecr.${CDK_DEFAULT_REGION}.amazonaws.com/triangulation-lambda:latest \
  --no-cli-pager 

