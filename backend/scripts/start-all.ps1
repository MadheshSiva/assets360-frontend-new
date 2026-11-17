# Windows equivalent of start-all.sh: builds the solution and starts all A360
# microservices + the ApiGateway in the background. Requires a local MongoDB on 27017.
#   powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

# MONGODB_URI from .env.local (gitignored) overrides MongoDb:ConnectionString in every service, e.g. MongoDB Atlas.
$EnvFile = Join-Path $RepoRoot '.env.local'
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | Where-Object { $_ -match '^\s*([^#=]+?)\s*=\s*(.*)$' } | ForEach-Object {
    Set-Item "env:$($Matches[1])" $Matches[2]
  }
}
if ($env:MONGODB_URI) {
  $env:MongoDb__ConnectionString = $env:MONGODB_URI
  Write-Host 'Using MongoDB from MONGODB_URI (.env.local)'
}
elseif (-not (Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  Write-Host 'MongoDB is not running on 27017. Trying to start the MongoDB Windows service...'
  Start-Service MongoDB
}

# name = project dir (relative to repo root), dll, port. Ports must match ApiGateway appsettings.json clusters.
$Services = @(
  @('useraccount',          'Services/UserAccount/Api/A360.UserAccount.Api',                     'A360.UserAccount.Api.dll',           5018),
  @('media',                'Services/Media/Api/A360.Media.Api',                                 'A360.Media.Api.dll',                 5300),
  @('asset',                'Services/Asset/Api/A360.Asset.Api',                                 'A360.Asset.Api.dll',                 5401),
  @('inspection',           'Services/Inspection/Api/A360.Inspection.Api',                       'A360.Inspection.Api.dll',            5410),
  @('eventlog',             'Services/EventLog/Api/A360.EventLog.Api',                           'A360.EventLog.Api.dll',              5420),
  @('maintenance',          'Services/Maintenance/Api/A360.Maintenance.Api',                     'A360.Maintenance.Api.dll',           5430),
  @('wip',                  'Services/WIP/Api/A360.Wip.Api',                                     'A360.Wip.Api.dll',                   5440),
  @('workflows',            'Services/Workflows/Api/A360.Workflows.Api',                         'A360.Workflows.Api.dll',             5450),
  @('administration',       'Services/Administration/Api/A360.Administration.Api',               'A360.Administration.Api.dll',        5460),
  @('dashboard',            'Services/Dashboard/Api/A360.Dashboard.Api',                         'A360.Dashboard.Api.dll',             5470),
  @('reportanalytics',      'Services/ReportAnalytics/Api/A360.ReportAnalytics.Api',             'A360.ReportAnalytics.Api.dll',       5480),
  @('tracking',             'Services/Tracking/Api/A360.Tracking.Api',                           'A360.Tracking.Api.dll',              5490),
  @('masterdatamanagement', 'Services/MasterDataManagement/Api/A360.MasterDataManagement.Api',     'A360.MasterDataManagement.Api.dll',  5500),
  @('apigateway',           'ApiGateway/A360.ApiGateway',                                        'A360.ApiGateway.dll',                5296)
)

Write-Host 'Building solution...'
dotnet build (Join-Path $RepoRoot 'src.sln') -c Debug > (Join-Path $LogDir 'build.log') 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed, see $LogDir\build.log"; exit 1 }

$env:ASPNETCORE_ENVIRONMENT = 'Development'
foreach ($s in $Services) {
  $name, $dir, $dll, $port = $s
  $binDir = Join-Path $RepoRoot "$dir/bin/Debug/net8.0"
  $env:ASPNETCORE_URLS = "http://0.0.0.0:$port"
  $p = Start-Process dotnet -ArgumentList $dll -WorkingDirectory $binDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir "$name.log") -RedirectStandardError (Join-Path $LogDir "$name.err.log")
  "$($p.Id)" | Out-File -Encoding ascii (Join-Path $LogDir "$name.pid")
  Write-Host "started $name on port $port (pid $($p.Id))"
}

Start-Sleep -Seconds 8
Write-Host "`n=== health check ==="
foreach ($s in $Services) {
  $port = $s[3]
  try { $code = (Invoke-WebRequest "http://localhost:$port/swagger/index.html" -UseBasicParsing -TimeoutSec 5).StatusCode }
  catch { $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'down' } }
  Write-Host ("{0,-22} port {1} -> {2}" -f $s[0], $port, $code)
}

Write-Host "`nGateway: http://localhost:5296/swagger"
Write-Host "Logs:    $LogDir"
Write-Host 'Stop with: .\scripts\stop-all.ps1'
