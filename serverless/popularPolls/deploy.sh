#!/bin/bash

export AWS_PROFILE="rix-admin-chris"


REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="popularPolls"
ZIP_FILE="function.zip"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/popularPolls-role-0o7z5cub"

# Check if required files exist
if [ ! -f "popularPolls.ts" ]; then
    echo "Error: popularPolls.ts not found in current directory ($(pwd))"
    exit 1
fi

if [ ! -f "normalize.ts" ]; then
    echo "Error: normalize.ts not found in current directory ($(pwd))"
    exit 1
fi

# Compile TypeScript
echo "Compiling TypeScript..."
npm run build

# Check if compilation was successful
if [ ! -d "dist" ]; then
    echo "Error: TypeScript compilation failed"
    exit 1
fi

# Create deployment package
rm -f $ZIP_FILE  # Remove any existing zip file
cd dist && zip -r ../$ZIP_FILE . && cd ..

# Check if zip file was created successfully
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: Failed to create zip file"
    exit 1
fi

# Update Lambda function configuration with increased memory and timeout
echo "Updating function $FUNCTION_NAME in $REGION..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --no-cli-pager >/dev/null 2>&1; then
    echo "Creating new function $FUNCTION_NAME in $REGION..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs22.x \
        --role $ROLE_ARN \
        --handler popularPolls.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 90 \
        --memory-size 1024 \
        --no-cli-pager
else
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 90 \
        --memory-size 1024 \
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
