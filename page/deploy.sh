set x
trap "exit" INT

aws_profile=default
s3_bucket=ip-vote.com
cf_id=E1LRNVH9OSGJT9

echo Profile: $aws_profile
echo S3_Bucket: $s3_bucket
echo CloudFront Distribution: $cf_id

if [ -z "$aws_profile" ]; then
  echo AWS_PROFILE not found
  exit
fi
if [ -z "$s3_bucket" ]; then
  echo S3_BUCKET not found
  exit
fi

export AWS_PROFILE=$aws_profile

if [ ! -d "public" ]; then
    echo "${red}public folder not found${reset}"
    exit 0;
fi

echo Synching Build Folder: $s3_bucket...
aws s3 sync public/ s3://$s3_bucket --delete --cache-control max-age=31530000,public

if [ ! -z "$cf_id" ]; then
    echo Invalidating cloudfront cache
    aws cloudfront create-invalidation --distribution-id $cf_id --paths "/*"
fi
