#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="updateLatency"
ZIP_FILE="function.zip"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/updateLatency-role-cq06dl7o"

# Check if required files exist
if [ ! -f "updateLatency.js" ]; then
    echo "Error: updateLatency.js not found in current directory ($(pwd))"
    exit 1
fi

# Create deployment package
rm -f $ZIP_FILE  # Remove any existing zip file
zip -r $ZIP_FILE updateLatency.js data/

# Check if zip file was created successfully
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: Failed to create zip file"
    exit 1
fi

# Update Lambda function configuration
echo "Updating function $FUNCTION_NAME in $REGION..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --no-cli-pager >/dev/null 2>&1; then
    echo "Creating new function $FUNCTION_NAME in $REGION..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs22.x \
        --role $ROLE_ARN \
        --handler updateLatency.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 900 \
        --memory-size 128 \
        --no-cli-pager
else
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 900 \
        --memory-size 128 \
        --region $REGION \
        --no-cli-pager
    sleep 5
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --no-cli-pager
fi

echo "Deployment to $REGION complete!"

# Clean up
rm -f $ZIP_FILE

echo "Deployment complete!" 