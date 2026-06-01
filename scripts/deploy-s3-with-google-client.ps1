#Requires -Version 5.1
<#
.SYNOPSIS
  Inject Google OAuth client id from AWS SSM into static registration pages, then deploy to S3/CloudFront.

.ENV
  GOOGLE_CLIENT_ID_SSM_PARAM  Optional. Default: /magic-indicator/prod/GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_ID            Optional fallback when SSM parameter is not present
  AWS_REGION                  Optional. Default: us-east-1
#>
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$region = $env:AWS_REGION
if ([string]::IsNullOrWhiteSpace($region)) { $region = "us-east-1" }

$paramName = $env:GOOGLE_CLIENT_ID_SSM_PARAM
if ([string]::IsNullOrWhiteSpace($paramName)) {
  $paramName = "/magic-indicator/prod/GOOGLE_CLIENT_ID"
}
$expectedGoogleClientId = "987937579183-4mrq96rt0rqofvsb8hmp353s48np9j2a.apps.googleusercontent.com"

function Read-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match ("^\s*" + [regex]::Escape($Name) + "\s*=") } | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($line)) { return "" }
  $value = [regex]::Replace($line, "^\s*" + [regex]::Escape($Name) + "\s*=\s*", "")
  $value = $value.Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value.Trim()
}

$googleClientId = ""
$prevErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$ssmRaw = @(aws ssm get-parameter `
    --name $paramName `
    --query "Parameter.Value" `
    --output text `
    --region $region 2>&1)
$ssmExitCode = $LASTEXITCODE
$ErrorActionPreference = $prevErrorActionPreference

if ($ssmExitCode -eq 0) {
  $googleClientId = ($ssmRaw -join "").Trim()
} else {
  Write-Host "SSM parameter not found or unreadable. Falling back to GOOGLE_CLIENT_ID env/.env." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($googleClientId)) {
  $googleClientId = [string]$env:GOOGLE_CLIENT_ID
}

if ([string]::IsNullOrWhiteSpace($googleClientId)) {
  $siteEnv = Join-Path $RepoRoot ".env"
  $googleClientId = Read-DotEnvValue -Path $siteEnv -Name "GOOGLE_CLIENT_ID"
}

if ([string]::IsNullOrWhiteSpace($googleClientId)) {
  $apiEnv = Join-Path (Split-Path -Parent $RepoRoot) "magic-indicator-api\.env"
  $googleClientId = Read-DotEnvValue -Path $apiEnv -Name "GOOGLE_CLIENT_ID"
}

if ([string]::IsNullOrWhiteSpace($googleClientId)) {
  Write-Error "GOOGLE_CLIENT_ID was not found in SSM, environment variables, or local .env files."
}

if (
  $googleClientId -notmatch '^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$' -or
  $googleClientId -match '^1234567890-' -or
  $googleClientId -match 'x{4,}' -or
  $googleClientId -ne $expectedGoogleClientId
) {
  Write-Error "GOOGLE_CLIENT_ID does not match the approved OAuth Web Client ID."
}

function Set-GoogleClientIdMeta {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$ClientId
  )

  $path = Join-Path $RepoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Error "대상 HTML 파일이 없습니다: $RelativePath"
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $html = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $meta = '<meta name="google-client-id" content="' + $ClientId + '" />'

  if ($html -match '<meta\s+name="google-client-id"\s+content="[^"]*"\s*/?>') {
    $html = [regex]::Replace($html, '<meta\s+name="google-client-id"\s+content="[^"]*"\s*/?>', $meta, 1)
  } elseif ($html -match '<meta\s+name="api-base"\s+content="[^"]*"\s*/?>') {
    $html = [regex]::Replace($html, '(<meta\s+name="api-base"\s+content="[^"]*"\s*/?>)', "`$1`r`n    $meta", 1)
  } else {
    Write-Error "google-client-id 메타를 삽입할 위치(api-base meta)를 찾지 못했습니다: $RelativePath"
  }

  [System.IO.File]::WriteAllText($path, $html, $utf8NoBom)
  Write-Host "Injected Google Client ID meta: $RelativePath" -ForegroundColor Green
}

Set-GoogleClientIdMeta -RelativePath "registration/index.html" -ClientId $googleClientId
Set-GoogleClientIdMeta -RelativePath "registration/associate.html" -ClientId $googleClientId
Set-GoogleClientIdMeta -RelativePath "registration/login.html" -ClientId $googleClientId

npm run deploy:s3
exit $LASTEXITCODE
