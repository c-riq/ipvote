#!/bin/bash

export AWS_PROFILE="rix-admin-chris"

# Change to the directory containing triangulationMaster.js
cd "$(dirname "$0")"

# List of regions to deploy to
REGIONS=(
    "us-east-1"      # N. Virginia (Master)
    "us-west-2"      # Oregon
    "eu-central-1"   # Frankfurt
    "ap-northeast-1" # Tokyo
    "sa-east-1"      # São Paulo
    "eu-west-1"      # Ireland
    "ap-south-1"    # Mumbai
    "af-south-1"     # Cape Town
)
FUNCTION_NAMES=(
    "triangulationMaster"
    "triangulationSlave-us-west-2"
    "triangulationSlave-eu-central"
    "triangulationSlave"
    "triangulationSlave-sa-east-1"
    "triangulationSlave-eu-west-1"
    "triangulationSlave-ap-south-1"
    "triangulationSlave-af-south-1"
)
IS_SLAVE=(
    "false"
    "true"
    "true"
    "true"
    "true"
    "true"
    "true"
    "true"
)

# Base function name
ZIP_FILE="function.zip"

# Check if triangulationMaster.js exists
if [ ! -f "triangulationMaster.js" ]; then
    echo "Error: triangulationMaster.js not found in current directory ($(pwd))"
    exit 1
fi

# Deploy to each region
for i in "${!REGIONS[@]}"
do
    region="${REGIONS[$i]}"
    function_name="${FUNCTION_NAMES[$i]}"
    is_slave="${IS_SLAVE[$i]}"
    
    echo "Deploying to $region..."
    
    # Set timeout based on whether this is master or slave
    if [ "$is_slave" = "false" ]; then
        TIMEOUT=3
    else
        TIMEOUT=5
    fi
    
    # Copy triangulationMaster.js to index.js and update the code
    cp triangulationMaster.js index.js
    sed -i.bak "s/const IS_SLAVE = .*;/const IS_SLAVE = $is_slave;/" index.js
    sed -i.bak "s/const AWS_REGION_OF_SLAVE = '.*';/const AWS_REGION_OF_SLAVE = '$region';/" index.js
    
    # Create deployment package with the JS file and .env
    rm -f $ZIP_FILE  # Remove any existing zip file
    zip $ZIP_FILE index.js .env
    
    # Check if zip file was created successfully
    if [ ! -f "$ZIP_FILE" ]; then
        echo "Error: Failed to create zip file"
        exit 1
    fi
    
    # Update existing function
    echo "Updating function $function_name in $region..."
    if ! aws lambda get-function --function-name $function_name --region $region --no-cli-pager >/dev/null 2>&1; then
        echo "Error: Function $function_name does not exist in $region"
        continue
    fi
    
    aws lambda update-function-code \
        --function-name $function_name \
        --zip-file fileb://$ZIP_FILE \
        --region $region \
        --no-cli-pager
    
    # Update function configuration
    # aws lambda update-function-configuration \
    #     --function-name $function_name \
    #     --timeout $TIMEOUT \
    #     --region $region
    
    echo "Deployment to $region complete!"
done

# Clean up
rm -f $ZIP_FILE
rm -f index.js
rm -f index.js.bak

echo "All deployments complete!"