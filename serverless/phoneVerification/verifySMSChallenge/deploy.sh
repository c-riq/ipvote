#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing the function
cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="verifySMSChallenge"
ZIP_FILE="function.zip"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/verifySMSChallenge-role-gw422t4q"

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "Loading environment variables from .env file"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found in current directory ($(pwd))"
    exit 1
fi

# Check required environment variables
if [ -z "$TWILIO_ACCOUNT_SID" ]; then
    echo "Error: TWILIO_ACCOUNT_SID environment variable is not set in .env"
    exit 1
fi

if [ -z "$TWILIO_AUTH_TOKEN" ]; then
    echo "Error: TWILIO_AUTH_TOKEN environment variable is not set in .env"
    exit 1
fi

if [ -z "$VERIFY_SERVICE_SID" ]; then
    echo "Error: VERIFY_SERVICE_SID environment variable is not set in .env"
    exit 1
fi

# Check if required files exist
if [ ! -f "verifySMSChallenge.js" ]; then
    echo "Error: verifySMSChallenge.js not found in current directory ($(pwd))"
    exit 1
fi

# Create a temporary directory for the package
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Copy function file
cp verifySMSChallenge.js "$TEMP_DIR/"
cp package.json "$TEMP_DIR/"

# Install dependencies
cd "$TEMP_DIR"
npm install --production
cd -

# Create deployment package
rm -f $ZIP_FILE  # Remove any existing zip file
cd "$TEMP_DIR"
zip -r "$OLDPWD/$ZIP_FILE" .
cd -

# Check if zip file was created successfully
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: Failed to create zip file"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Format environment variables for AWS CLI
ENV_VARS="Variables={TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID,TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN,VERIFY_SERVICE_SID=$VERIFY_SERVICE_SID}"

# Update existing function or create new one
echo "Updating function $FUNCTION_NAME in $REGION..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --no-cli-pager >/dev/null 2>&1; then
    echo "Creating new function $FUNCTION_NAME in $REGION..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs22.x \
        --role $ROLE_ARN \
        --handler verifySMSChallenge.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 10 \
        --memory-size 128 \
        --environment "$ENV_VARS" \
        --no-cli-pager
else
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 10 \
        --memory-size 128 \
        --environment "$ENV_VARS" \
        --region $REGION \
        --no-cli-pager
    
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --no-cli-pager
fi

# Clean up
rm -f $ZIP_FILE
rm -rf "$TEMP_DIR"

echo "Deployment complete!"