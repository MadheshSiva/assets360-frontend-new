#!/usr/bin/env bash
# Starts all A360 services + the ApiGateway inside a single container.
# MongoDB is external: MONGODB_URI (e.g. MongoDB Atlas) overrides MongoDb:ConnectionString in every service.
set -euo pipefail

if [ -z "${MONGODB_URI:-}" ]; then
  echo "MONGODB_URI is not set" >&2
  exit 1
fi
export MongoDb__ConnectionString="$MONGODB_URI"
export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Production}"

# The Jwt:SigningKey in appsettings.json is committed to git, so it is only fit for local development.
if [ "$ASPNETCORE_ENVIRONMENT" = "Production" ] && [ -z "${Jwt__SigningKey:-}" ]; then
  echo "Jwt__SigningKey is not set (required in Production)" >&2
  exit 1
fi
if [ "$ASPNETCORE_ENVIRONMENT" = "Production" ] && [ -z "${Smtp__Host:-}" ]; then
  echo "warning: Smtp__Host is not set, login OTP emails will not be sent" >&2
fi

# Ports must match the cluster addresses in ApiGateway appsettings.json.
declare -A SERVICES=(
  ["useraccount"]="A360.UserAccount.Api.dll:5018"
  ["media"]="A360.Media.Api.dll:5300"
  ["asset"]="A360.Asset.Api.dll:5401"
  ["inspection"]="A360.Inspection.Api.dll:5410"
  ["eventlog"]="A360.EventLog.Api.dll:5420"
  ["maintenance"]="A360.Maintenance.Api.dll:5430"
  ["wip"]="A360.Wip.Api.dll:5440"
  ["workflows"]="A360.Workflows.Api.dll:5450"
  ["administration"]="A360.Administration.Api.dll:5460"
  ["dashboard"]="A360.Dashboard.Api.dll:5470"
  ["tracking"]="A360.Tracking.Api.dll:5490"
  ["masterdatamanagement"]="A360.MasterDataManagement.Api.dll:5500"
  ["reportanalytics"]="A360.ReportAnalytics.Api.dll:5480"
)

for name in "${!SERVICES[@]}"; do
  IFS=':' read -r dll port <<< "${SERVICES[$name]}"
  ( cd "/app/$name" && ASPNETCORE_URLS="http://0.0.0.0:${port}" dotnet "$dll" 2>&1 | sed "s/^/[$name] /" & )
  echo "started $name on port $port"
done

sleep 3

cd /app/apigateway
export ASPNETCORE_URLS="http://0.0.0.0:5296"
exec dotnet A360.ApiGateway.dll
