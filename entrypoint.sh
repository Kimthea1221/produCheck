#!/bin/sh
set -e

DATASETS_DIR="backend/nlp/datasets"
ASSET_DIR="backend/nlp/assets"
HASH_FILE="$ASSET_DIR/.raw_hash"

mkdir -p "$ASSET_DIR"

IMAGE_BUILD_ID_FILE="/everifymo/.build_id"
DEPLOYED_BUILD_ID_FILE="$ASSET_DIR/.last_deployed_id"

# Check if this is a new deployment (newly built Docker image)
IS_NEW_DEPLOYMENT=false
if [ -f "$IMAGE_BUILD_ID_FILE" ]; then
    CURRENT_BUILD_ID=$(cat "$IMAGE_BUILD_ID_FILE" 2>/dev/null)
    LAST_DEPLOYED_ID=$(cat "$DEPLOYED_BUILD_ID_FILE" 2>/dev/null || echo "")

    if [ "$CURRENT_BUILD_ID" != "$LAST_DEPLOYED_ID" ]; then
        echo "New deployment detected (Build ID: $CURRENT_BUILD_ID). Forcing fresh asset rebuild..."
        IS_NEW_DEPLOYMENT=true
        rm -f "$HASH_FILE"
    fi
fi

if ls "$DATASETS_DIR"/*.csv 1> /dev/null 2>&1; then
    CURRENT_HASH=$(cat "$DATASETS_DIR"/*.csv | sha256sum | cut -d ' ' -f 1)

    if [ "$IS_NEW_DEPLOYMENT" = "true" ] || [ ! -f "$HASH_FILE" ] || [ "$(cat "$HASH_FILE" 2>/dev/null)" != "$CURRENT_HASH" ]; then
        echo "Dataset change or new deployment detected — running NLP asset pipeline..."
        cd backend && python nlp/preprocessing/buildassets.py && cd ..
        echo "$CURRENT_HASH" > "$HASH_FILE"
        if [ -f "$IMAGE_BUILD_ID_FILE" ]; then
            cp "$IMAGE_BUILD_ID_FILE" "$DEPLOYED_BUILD_ID_FILE"
        fi
        echo "Pipeline complete. Updated hash and deployment ID saved."
    else
        echo "No changes in deployment or datasets — skipping rebuild, using existing assets."
    fi
else
    echo "No raw CSV files found in $DATASETS_DIR. Skipping asset build, using existing assets."
fi

exec uvicorn backend.main:app --host 0.0.0.0 --port 8001