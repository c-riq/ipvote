#!/bin/bash
set -e
trap "exit" INT

# Configuration
aws_profile=rix-admin-chris
s3_bucket=ip-vote.com
cf_id=E1LRNVH9OSGJT9

echo "Profile: $aws_profile"
echo "S3 Bucket: $s3_bucket"
echo "CloudFront Distribution: $cf_id"

# Validate required variables
if [ -z "$aws_profile" ] || [ -z "$s3_bucket" ]; then
  echo "Error: Missing required configuration"
  exit 1
fi

export AWS_PROFILE=$aws_profile

# Build the project
echo "Building project..."
npm run build

# Generate random string for cache busting
random_string=$(openssl rand -hex 4)
echo "Generated random suffix: $random_string"

# Validate build output
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "Error: Build failed or dist/index.html not found"
    exit 1
fi

# Rename index.html with random string
mv dist/index.html "dist/index_${random_string}.html"

# Sync all files except HTML with long cache duration
echo Synching Build Folder: $s3_bucket...
aws s3 sync dist/ s3://$s3_bucket --delete --exclude "*.html" --exclude "**/.DS_Store" --cache-control max-age=31530000,public

# Upload static HTML files with standard caching
echo "Uploading static HTML files..."
for html_file in privacy_policy.html terms_of_service.html ip_based_polls_as_a_proxy_for_popular_opinion.html world_presidential_election.html; do
    if [ -f "dist/$html_file" ]; then
        aws s3 cp "dist/$html_file" "s3://$s3_bucket/$html_file" \
            --cache-control "max-age=3600" \
            --content-type "text/html; charset=UTF-8"
    fi
done

# Upload index HTML file with no-cache headers
aws s3 cp "dist/index_${random_string}.html" "s3://$s3_bucket/index_${random_string}.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html; charset=UTF-8"

# Delete old index HTML files
echo "Cleaning up old index HTML files..."
aws s3 ls "s3://$s3_bucket/" | grep 'index_.*\.html' | grep -v "index_${random_string}.html" | awk '{print $4}' | \
while read -r file; do
    echo "Deleting old file: $file"
    aws s3 rm "s3://$s3_bucket/$file"
done

# Update CloudFront function or origin response policy to use the new index file
if [ ! -z "$cf_id" ]; then
    echo Invalidating cloudfront cache
    aws cloudfront create-invalidation --distribution-id $cf_id --paths "/*" --no-cli-pager
    
    # Get current distribution config
    aws cloudfront get-distribution-config --id $cf_id > cf_config_temp.json
    
    # Extract ETag (required for update-distribution)
    etag=$(jq -r '.ETag' cf_config_temp.json)
    
    # Update distribution config with new error page and default root object
    # Preserve existing config and only update CustomErrorResponses and DefaultRootObject
    jq --arg newfile "index_${random_string}.html" '.DistributionConfig | .CustomErrorResponses.Items = [
        {
            "ErrorCode": 403,
            "ResponsePagePath": "/\($newfile)",
            "ResponseCode": "200",
            "ErrorCachingMinTTL": 300
        },
        {
            "ErrorCode": 404,
            "ResponsePagePath": "/\($newfile)",
            "ResponseCode": "200",
            "ErrorCachingMinTTL": 300
        }
    ] | .CustomErrorResponses.Quantity = 2 | .DefaultRootObject = $newfile' cf_config_temp.json > cf_config_updated.json

    # Update the distribution with new config
    aws cloudfront update-distribution --id $cf_id \
        --distribution-config file://cf_config_updated.json \
        --if-match $etag \
        --no-cli-pager

    # Also update default root object directly
    aws cloudfront update-distribution --id $cf_id \
        --default-root-object "index_${random_string}.html" \
        --no-cli-pager

    # Clean up temporary files
    rm cf_config_temp.json cf_config_updated.json
fi
