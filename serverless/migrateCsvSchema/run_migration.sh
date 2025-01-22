#!/bin/bash

# Ensure AWS credentials are set
if [ -z "$AWS_PROFILE" ]; then
    export AWS_PROFILE="rix-admin-chris"
fi

# Run the migration script
node fixPollMismatches.js 