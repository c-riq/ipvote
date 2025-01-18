#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing ipInfo.js
cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="ipInfos"
ZIP_FILE="function.zip"
PARTITION_DIR="ip_info_io_country_asn_partitioned"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/ipInfos-role-1wyjn6i5"

# Check if required files exist
if [ ! -f "ipInfo.js" ]; then
    echo "Error: ipInfo.js not found in current directory ($(pwd))"
    exit 1
fi

if [ ! -f "ipCountryLookup.js" ]; then
    echo "Error: ipCountryLookup.js not found in current directory ($(pwd))"
    exit 1
fi

# Check if partition directory exists
if [ ! -d "$PARTITION_DIR" ]; then
    echo "Error: Partition directory not found at $PARTITION_DIR"
    exit 1
fi

# Create deployment package
rm -f $ZIP_FILE  # Remove any existing zip file
zip -r $ZIP_FILE ipInfo.js ipCountryLookup.js "$PARTITION_DIR"

# Check if zip file was created successfully
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: Failed to create zip file"
    exit 1
fi

# Update existing function
echo "Updating function $FUNCTION_NAME in $REGION..."
if ! aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --no-cli-pager >/dev/null 2>&1; then
    echo "Creating new function $FUNCTION_NAME in $REGION..."
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime nodejs22.x \
        --role $ROLE_ARN \
        --handler ipInfo.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 10 \
        --memory-size 512 \
        --no-cli-pager
else
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --memory-size 512 \
        --region $REGION \
        --no-cli-pager
    
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
