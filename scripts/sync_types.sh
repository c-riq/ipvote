#!/bin/bash

# Create directory if it doesn't exist
mkdir -p frontend/src/api

# Copy the types file
cp serverless/processVote/processVoteTypes.ts frontend/src/api/processVoteTypes.ts

echo "Types synced successfully!" 