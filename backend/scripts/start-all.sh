#!/usr/bin/env bash
# Starts MongoDB + all A360 microservices + the ApiGateway in the background.
# Run from a real terminal (not from Claude) so the processes survive after this script exits:
#   ./scripts/start-all.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$REPO_ROOT/logs"
mkdir -p "$LOGDIR"

MONGOD_BIN="/home/dell/mongodb/mongodb-linux-x86_64-ubuntu2204-7.0.14/bin/mongod"
MONGO_DATA="/home/dell/mongodb/data"
MONGO_LOG="/home/dell/mongodb/logs/mongod.log"

if ! ss -tln 2>/dev/null | grep -q ':27017 '; then
  echo "Starting MongoDB..."
  nohup "$MONGOD_BIN" --dbpath "$MONGO_DATA" --logpath "$MONGO_LOG" --port 27017 --bind_ip 127.0.0.1 > /dev/null 2>&1 &
  disown
  sleep 3
else
  echo "MongoDB already running."
fi

declare -A SERVICES=(
  ["media"]="Services/Media/Api/A360.Media.Api/bin/Debug/net8.0:A360.Media.Api.dll:5300"
  ["asset"]="Services/Asset/Api/A360.Asset.Api/bin/Debug/net8.0:A360.Asset.Api.dll:5401"
  ["inspection"]="Services/Inspection/Api/A360.Inspection.Api/bin/Debug/net8.0:A360.Inspection.Api.dll:5410"
  ["eventlog"]="Services/EventLog/Api/A360.EventLog.Api/bin/Debug/net8.0:A360.EventLog.Api.dll:5420"
  ["masterdatamanagement"]="Services/MasterDataManagement/Api/A360.MasterDataManagement.Api/bin/Debug/net8.0:A360.MasterDataManagement.Api.dll:5500"
  ["administration"]="Services/Administration/Api/A360.Administration.Api/bin/Debug/net8.0:A360.Administration.Api.dll:5460"
  ["reportanalytics"]="Services/ReportAnalytics/Api/A360.ReportAnalytics.Api/bin/Debug/net8.0:A360.ReportAnalytics.Api.dll:5480"
  ["apigateway"]="ApiGateway/A360.ApiGateway/bin/Debug/net8.0:A360.ApiGateway.dll:5296"
)

echo "Building solution..."
dotnet build "$REPO_ROOT/src.sln" -c Debug > "$LOGDIR/build.log" 2>&1 || {
  echo "Build failed, see $LOGDIR/build.log"; exit 1;
}

for name in "${!SERVICES[@]}"; do
  IFS=':' read -r dir dll port <<< "${SERVICES[$name]}"
  ( cd "$REPO_ROOT/$dir" && ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS="http://0.0.0.0:${port}" \
    nohup dotnet "$dll" > "$LOGDIR/${name}.log" 2>&1 & )
  echo "started $name on port $port"
done
disown -a 2>/dev/null || true

sleep 6
echo
echo "=== health check ==="
for p in 5296 5300 5401 5410 5420 5500 5460 5480; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$p/swagger/index.html" || echo "down")
  echo "port $p -> $code"
done

echo
echo "Gateway: http://localhost:5296/swagger"
echo "Logs:    $LOGDIR/*.log"
echo "Stop with: ./scripts/stop-all.sh"
