#!/usr/bin/env bash
# Stops all A360 microservices + the ApiGateway started by start-all.sh.
# MongoDB is left running (shared with other tools); pass --with-mongo to stop it too.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$REPO_ROOT/logs"

DLLS=(
  A360.Media.Api.dll
  A360.Asset.Api.dll
  A360.Inspection.Api.dll
  A360.EventLog.Api.dll
  A360.MasterDataManagement.Api.dll
  A360.ReportAnalytics.Api.dll
  A360.ApiGateway.dll
)

for dll in "${DLLS[@]}"; do
  if pkill -f "dotnet .*${dll}$" 2>/dev/null; then
    echo "stopped $dll"
  fi
done

rm -f "$LOGDIR"/*.pid

if [ "${1:-}" = "--with-mongo" ]; then
  pkill -f "mongod --dbpath /home/dell/mongodb/data" 2>/dev/null && echo "stopped mongod" || true
fi
