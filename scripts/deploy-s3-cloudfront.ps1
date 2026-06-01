#Requires -Version 5.1
<#
.SYNOPSIS
  Run npm verify, sync site to S3, optional CloudFront invalidation.
.USAGE
  Optional env: AWS_S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, AWS_REGION
  Example: $env:AWS_S3_BUCKET = "magicindicator-global-web-6145"
           $env:CLOUDFRONT_DISTRIBUTION_ID = "E2Y7ZN7QM8A91S"
  Run: .\scripts\deploy-s3-cloudfront.ps1
#>
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
  Write-Error "package.json not found (wrong folder): $RepoRoot"
}

$Bucket = $env:AWS_S3_BUCKET
if ([string]::IsNullOrWhiteSpace($Bucket)) { $Bucket = "magicindicator-global-web-6145" }

$CfId = $env:CLOUDFRONT_DISTRIBUTION_ID
$CfFile = Join-Path $PSScriptRoot "cloudfront-distribution-id"
if ([string]::IsNullOrWhiteSpace($CfId) -and (Test-Path -LiteralPath $CfFile)) {
  $line = (Get-Content -LiteralPath $CfFile -Raw).Trim()
  if ($line -and ($line -notmatch "^\s*#")) { $CfId = $line.Split("`n")[0].Trim() }
}

Set-Location $RepoRoot

if (-not (Test-Path (Join-Path $RepoRoot "index.html"))) {
  Write-Error "index.html missing at project root."
}

Write-Host "== npm run verify" -ForegroundColor Cyan
npm run verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Prefer PATH; otherwise common Windows AWS CLI v2 install location (PATH not refreshed after MSI)
$foundAws = Get-Command aws.exe -ErrorAction SilentlyContinue
if (-not $foundAws) {
  foreach ($d in @(
      (Join-Path $env:ProgramFiles "Amazon\AWSCLIV2"),
      (Join-Path ${env:ProgramFiles(x86)} "Amazon\AWSCLIV2")
    )) {
    $awsPath = Join-Path $d "aws.exe"
    if (Test-Path -LiteralPath $awsPath) {
      $env:PATH = "$d;$env:PATH"
      break
    }
  }
}

$foundAws = Get-Command aws.exe -ErrorAction SilentlyContinue
if (-not $foundAws) {
  Write-Error @"
AWS CLI (aws.exe) not found.

Install then restart CMD/PowerShell:
  winget install -e --id Amazon.AWSCLI
Or MSI: https://aws.amazon.com/cli/

Then credentials:
  aws configure
  OR  aws sso login
"@
}

function Test-AwsProfileUsesSso {
  param([string]$ProfileName)
  if ([string]::IsNullOrWhiteSpace($ProfileName)) { return $false }
  $sso = aws configure get sso_start_url --profile $ProfileName 2>$null
  return ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($sso | Out-String).Trim()))
}

function Ensure-AwsCliSession {
  $env:AWS_PAGER = ""
  $raw = @(aws sts get-caller-identity --output json 2>&1)
  $stsCode = $LASTEXITCODE
  $comb = ($raw | Out-String)

  if (($stsCode -eq 0) -and ($comb -match '"Account"')) {
    return
  }

  $lower = $comb.ToLowerInvariant()
  $refreshHint = (
    ($lower.Contains("reauthenticate")) -or
    ($lower.Contains("aws login")) -or
    ($lower.Contains("session has expired")) -or
    ($lower.Contains("expiredtoken")) -or
    ($lower.Contains("token has expired")) -or
    ($lower.Contains("token expired")) -or
    ($lower.Contains("sso_token_expired")) -or
    ($lower.Contains("sso session")) -or
    ($lower.Contains("refresh failed")) -or
    ($lower.Contains("invalid_grant")) -or
    ($lower.Contains("unable to locate credentials")) -or
    ($lower.Contains("could not load credentials")) -or
    ($lower.Contains("error loading sso token")) -or
    ($lower.Contains("the sso session associated with this profile has expired"))
  )

  if (-not $refreshHint) {
    Write-Error @"
AWS STS 실패(credential / 권한). 출력:
$comb
AWS_PROFILE / aws configure 를 확인하세요.
"@
  }

  Write-Host "AWS CLI 세션 없음 또는 만료 — 자동 재인증 시도 (브라우저/프롬프트가 뜨면 완료)..." -ForegroundColor Yellow

  $didLogin = $false
  $p = $env:AWS_PROFILE

  if (-not [string]::IsNullOrWhiteSpace($p) -and (Test-AwsProfileUsesSso $p)) {
    Write-Host "== aws sso login --profile $p" -ForegroundColor Cyan
    aws sso login --profile $p
    if ($LASTEXITCODE -eq 0) { $didLogin = $true }
  }

  if (-not $didLogin) {
    if (-not [string]::IsNullOrWhiteSpace($p)) {
      Write-Host "== aws login --profile $p" -ForegroundColor Cyan
      aws login --profile $p
      if ($LASTEXITCODE -eq 0) { $didLogin = $true }
    }
  }

  if (-not $didLogin) {
    Write-Host "== aws login" -ForegroundColor Cyan
    aws login
    if ($LASTEXITCODE -eq 0) { $didLogin = $true }
  }

  $raw2 = @(aws sts get-caller-identity --output json 2>&1)
  if (($LASTEXITCODE -ne 0) -or -not (($raw2 | Out-String) -match '"Account"')) {
    Write-Error @"
재인증 후에도 STS 실패. 출력:
$(($raw2 | Out-String))
"@
  }

  Write-Host "AWS CLI 세션 OK (get-caller-identity)." -ForegroundColor Green
}

$region = $env:AWS_REGION
if ([string]::IsNullOrWhiteSpace($region)) { $region = "us-east-1" }

Ensure-AwsCliSession

Write-Host "== aws s3 sync -> s3://$Bucket/ (region $region)" -ForegroundColor Cyan
aws s3 sync $RepoRoot "s3://$Bucket/" --delete --region $region `
  --exclude "node_modules/*" `
  --exclude ".git/*" `
  --exclude ".cursor/*" `
  --exclude ".gitignore" `
  --exclude "*.ps1" `
  --exclude "package.json" `
  --exclude "package-lock.json" `
  --exclude ".env" `
  --exclude ".env.*" `
  --exclude "scripts/*" `
  --exclude "tools/*" `
  --exclude "docs/*" `
  --exclude "*.md"

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "S3 sync done." -ForegroundColor Green

Write-Host "== aws s3 sync (HTML only, revalidate / low CDN edge TTL hint)" -ForegroundColor Cyan
aws s3 sync $RepoRoot "s3://$Bucket/" --region $region `
  --exclude "*" `
  --include "*.html" `
  --exclude "node_modules/*" `
  --exclude ".git/*" `
  --exclude ".cursor/*" `
  --exclude "scripts/*" `
  --exclude "tools/*" `
  --exclude "docs/*" `
  --cache-control "public, max-age=0, must-revalidate, s-maxage=60"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

function Resolve-CloudFrontDistributionId {
  param([string]$BucketName)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  try {
    $raw = aws cloudfront list-distributions --output json --region us-east-1 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { return $null }
    $j = $raw | ConvertFrom-Json
    if (-not $j.DistributionList -or -not $j.DistributionList.Items) { return $null }
    foreach ($it in $j.DistributionList.Items) {
      if ($it.Aliases -and $it.Aliases.Items) {
        foreach ($a in $it.Aliases.Items) {
          if ($a -match 'magicindicatorglobal\.com') { return $it.Id }
        }
      }
    }
    foreach ($it in $j.DistributionList.Items) {
      foreach ($o in $it.Origins.Items) {
        if ($o.DomainName -and ($o.DomainName -match [regex]::Escape($BucketName))) { return $it.Id }
      }
    }
  }
  catch {
    return $null
  }
  finally {
    $ErrorActionPreference = $prev
  }
  return $null
}

if ([string]::IsNullOrWhiteSpace($CfId)) {
  $resolved = Resolve-CloudFrontDistributionId -BucketName $Bucket
  if (-not [string]::IsNullOrWhiteSpace($resolved)) {
    $CfId = $resolved
    Write-Host "CloudFront distribution id (auto-detected): $CfId" -ForegroundColor Cyan
  }
}

if (-not [string]::IsNullOrWhiteSpace($CfId)) {
  Write-Host "== CloudFront invalidation: $CfId" -ForegroundColor Cyan
  aws cloudfront create-invalidation --distribution-id $CfId --paths "/*" --region us-east-1
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Invalidation submitted (may take a few minutes)." -ForegroundColor Green
} else {
  Write-Host "SKIP: CloudFront invalidation — set CLOUDFRONT_DISTRIBUTION_ID or add scripts/cloudfront-distribution-id (see .example)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Manual checks in AWS console:" -ForegroundColor DarkGray
Write-Host "  1) S3 bucket root has index.html (also: aws s3 ls s3://$Bucket/ )" -ForegroundColor DarkGray
Write-Host "  2) CloudFront General: Default root object = index.html" -ForegroundColor DarkGray
Write-Host "  3) Origin OAC + bucket policy allows s3:GetObject (fixes AccessDenied)" -ForegroundColor DarkGray
Write-Host ""
