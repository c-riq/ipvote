#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing validateCaptcha.js
cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="validateCaptcha"
ZIP_FILE="function.zip"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/validateCaptcha-role-o0pop0mv"

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    while IFS='=' read -r key value; do
        if [ -n "$key" ] && [ -n "$value" ] && [[ ! "$key" =~ ^# ]]; then
            # Remove any surrounding quotes from the value
            value=$(echo "$value" | tr -d '"'"'")
            export "$key=$value"
        fi
    done < ".env"
fi

# Check if HCAPTCHA_SECRET is set
if [ -z "$HCAPTCHA_SECRET_KEY" ]; then
    echo "Error: HCAPTCHA_SECRET_KEY environment variable not set"
    exit 1
fi

# Check if required files exist
if [ ! -f "validateCaptcha.js" ]; then
    echo "Error: validateCaptcha.js not found in current directory ($(pwd))"
    exit 1
fi

# Create deployment package
rm -f $ZIP_FILE  # Remove any existing zip file
zip -r $ZIP_FILE validateCaptcha.js

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
        --handler validateCaptcha.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 30 \
        --memory-size 128 \
        --environment "Variables={HCAPTCHA_SECRET_KEY=$HCAPTCHA_SECRET_KEY}" \
        --no-cli-pager
else
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 30 \
        --memory-size 128 \
        --environment "Variables={HCAPTCHA_SECRET_KEY=$HCAPTCHA_SECRET_KEY}" \
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
