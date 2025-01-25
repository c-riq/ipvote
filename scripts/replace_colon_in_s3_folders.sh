export AWS_PROFILE="rix-admin-chris"

# Create a temporary file to store the move commands
temp_file=$(mktemp)

# Count total files to process
total_files=$(aws s3 ls s3://ipvotes/triangulation/ --recursive | awk '{print $4}' | grep ":" | wc -l)
echo "Found $total_files files to process"

# Generate move commands for all files containing colons
counter=0
aws s3 ls s3://ipvotes/triangulation/ --recursive | awk '{print $4}' | grep ":" | while read -r key; do
    new_key="${key//:/;}"
    echo "aws s3 mv \"s3://ipvotes/${key}\" \"s3://ipvotes/${new_key}\" && echo \"Processed file $((counter+=1)) of $total_files\"" >> "$temp_file"
done

echo "Starting file moves..."

# Execute moves in parallel (20 jobs at a time) using xargs with smaller batches
cat "$temp_file" | tr '\n' '\0' | xargs -0 -P 20 -n 1 sh -c

# Clean up
rm "$temp_file"

echo "All moves completed!"

