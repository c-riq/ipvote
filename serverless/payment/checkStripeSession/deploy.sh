#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing the function
cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="checkStripePayment"
ZIP_FILE="function.zip"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/checkStripePayment-role-9cd7f880"

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "Loading environment variables from .env file"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found in current directory ($(pwd))"
    exit 1
fi

# Check required environment variables
if [ -z "$STRIPE_SECRET_KEY" ]; then
    echo "Error: STRIPE_SECRET_KEY environment variable is not set in .env"
    exit 1
fi

# Check if required files exist
if [ ! -f "checkStripeSession.js" ]; then
    echo "Error: checkStripeSession.js not found in current directory ($(pwd))"
    exit 1
fi

# Create a temporary directory for the package
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Copy function file and package.json
cp checkStripeSession.js "$TEMP_DIR/"
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
ENV_VARS="Variables={STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY}"

# Deploy Lambda function
echo "Deploying Lambda function $FUNCTION_NAME..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --no-cli-pager >/dev/null 2>&1; then
    echo "Creating new Lambda function..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs22.x \
        --role $ROLE_ARN \
        --handler checkStripeSession.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 30 \
        --memory-size 256 \
        --environment "$ENV_VARS" \
        --no-cli-pager

    # Create function URL
    aws lambda create-function-url-config \
        --function-name $FUNCTION_NAME \
        --auth-type NONE \
        --region $REGION \
        --no-cli-pager
else
    echo "Updating existing Lambda function..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 30 \
        --memory-size 256 \
        --environment "$ENV_VARS" \
        --region $REGION \
        --no-cli-pager
    
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --no-cli-pager
fi

# Get the function URL
FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name $FUNCTION_NAME \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text \
    --no-cli-pager)

echo "Deployment complete!"

# Clean up
rm -f $ZIP_FILE
rm -rf "$TEMP_DIR"