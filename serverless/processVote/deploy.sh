#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing processVote.js
cd "$(dirname "$0")"

REGION="us-east-1"      # N. Virginia
FUNCTION_NAME="process_ip_vote"
ZIP_FILE="function.zip"
PARTITION_DIR="from_ipInfos"
ROLE_ARN="arn:aws:iam::152769399840:role/service-role/process_ip_vote-role-e2qax5j9"

# Check if required files exist
if [ ! -f "processVote.js" ]; then
    echo "Error: processVote.js not found in current directory ($(pwd))"
    exit 1
fi

if [ ! -f "$PARTITION_DIR/ipCountryLookup.js" ]; then
    echo "Error: ipCountryLookup.js not found in $PARTITION_DIR directory"
    exit 1
fi

# Check if IP data directory exists
IP_DATA_DIR="$PARTITION_DIR/ip_info_io_country_asn_partitioned"
if [ ! -d "$IP_DATA_DIR" ]; then
    echo "Error: IP data directory not found at $IP_DATA_DIR"
    exit 1
fi

# Create deployment package
rm -f $ZIP_FILE  # Remove any existing zip file
zip -r $ZIP_FILE processVote.js "$PARTITION_DIR"

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
        --handler processVote.handler \
        --zip-file fileb://$ZIP_FILE \
        --region $REGION \
        --timeout 30 \
        --memory-size 1024 \
        --no-cli-pager
else
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --timeout 30 \
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
