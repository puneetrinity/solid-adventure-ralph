#!/bin/bash
# Railway start script - routes to correct service based on RAILWAY_SERVICE_NAME

set -e

case "$RAILWAY_SERVICE_NAME" in
  api)
    echo "Starting API..."
    npm run start:api
    ;;
  worker)
    echo "Starting Worker..."
    npm run start:worker
    ;;
  *)
    echo "Unknown service: $RAILWAY_SERVICE_NAME"
    echo "Expected: api, worker"
    exit 1
    ;;
esac
