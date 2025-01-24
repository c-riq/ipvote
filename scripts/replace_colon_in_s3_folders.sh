export AWS_PROFILE="rix-admin-chris"
aws s3 ls s3://ipvotes/triangulation/ --recursive | awk '{print $4}' | while read -r key; do
    if [[ $key == *":"* ]]; then
        new_key="${key//:/;}"
        aws s3 mv "s3://ipvotes/$key" "s3://ipvotes/$new_key"
    fi
done

