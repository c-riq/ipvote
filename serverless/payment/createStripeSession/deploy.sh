#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing the function
cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="createStripeSession"
ZIP_FILE="function.zip"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/createStripeSession-role-7sbbcc10"

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

if [ -z "$APP_URL" ]; then
    echo "Error: APP_URL environment variable is not set in .env"
    exit 1
fi

if [ -z "$ALLOWED_ORIGIN" ]; then
    echo "Error: ALLOWED_ORIGIN environment variable is not set in .env"
    exit 1
fi

# Check if required files exist
if [ ! -f "createStripeSession.js" ]; then
    echo "Error: createStripeSession.js not found in current directory ($(pwd))"
    exit 1
fi

# Create a temporary directory for the package
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Copy function file
cp createStripeSession.js "$TEMP_DIR/"

# Create package.json
cat > "$TEMP_DIR/package.json" << EOL
{
  "name": "stripe-verification-lambda",
  "version": "1.0.0",
  "dependencies": {
    "stripe": "^14.0.0"
  }
}
EOL

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
ENV_VARS="Variables={STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY,APP_URL=$APP_URL,ALLOWED_ORIGIN=$ALLOWED_ORIGIN,STRIPE_PRICE_ID=$STRIPE_PRICE_ID}"

# Update existing function or create new one
echo "Updating function $FUNCTION_NAME in $REGION..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --no-cli-pager >/dev/null 2>&1; then
    echo "Creating new function $FUNCTION_NAME in $REGION..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs22.x \
        --role $ROLE_ARN \
        --handler createStripeSession.handler \
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