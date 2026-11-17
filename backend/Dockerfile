# Builds and runs all A360 services + ApiGateway inside a single Cloudflare Container instance.
# MongoDB is external (MongoDB Atlas): pass the connection string as the MONGODB_URI env var.

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore src.sln

RUN dotnet publish ApiGateway/A360.ApiGateway/A360.ApiGateway.csproj -c Release -o /out/apigateway --no-restore && \
    dotnet publish Services/UserAccount/Api/A360.UserAccount.Api/A360.UserAccount.Api.csproj -c Release -o /out/useraccount --no-restore && \
    dotnet publish Services/Media/Api/A360.Media.Api/A360.Media.Api.csproj -c Release -o /out/media --no-restore && \
    dotnet publish Services/Asset/Api/A360.Asset.Api/A360.Asset.Api.csproj -c Release -o /out/asset --no-restore && \
    dotnet publish Services/Inspection/Api/A360.Inspection.Api/A360.Inspection.Api.csproj -c Release -o /out/inspection --no-restore && \
    dotnet publish Services/EventLog/Api/A360.EventLog.Api/A360.EventLog.Api.csproj -c Release -o /out/eventlog --no-restore && \
    dotnet publish Services/Maintenance/Api/A360.Maintenance.Api/A360.Maintenance.Api.csproj -c Release -o /out/maintenance --no-restore && \
    dotnet publish Services/WIP/Api/A360.Wip.Api/A360.Wip.Api.csproj -c Release -o /out/wip --no-restore && \
    dotnet publish Services/Workflows/Api/A360.Workflows.Api/A360.Workflows.Api.csproj -c Release -o /out/workflows --no-restore && \
    dotnet publish Services/Administration/Api/A360.Administration.Api/A360.Administration.Api.csproj -c Release -o /out/administration --no-restore && \
    dotnet publish Services/Dashboard/Api/A360.Dashboard.Api/A360.Dashboard.Api.csproj -c Release -o /out/dashboard --no-restore && \
    dotnet publish Services/Tracking/Api/A360.Tracking.Api/A360.Tracking.Api.csproj -c Release -o /out/tracking --no-restore && \
    dotnet publish Services/MasterDataManagement/Api/A360.MasterDataManagement.Api/A360.MasterDataManagement.Api.csproj -c Release -o /out/masterdatamanagement --no-restore && \
    dotnet publish Services/ReportAnalytics/Api/A360.ReportAnalytics.Api/A360.ReportAnalytics.Api.csproj -c Release -o /out/reportanalytics --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /out/ ./

COPY start.sh /app/start.sh
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

EXPOSE 5296
ENTRYPOINT ["/app/start.sh"]
