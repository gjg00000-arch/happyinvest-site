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

$region = $env:AWS_REGION
if ([string]::IsNullOrWhiteSpace($region)) { $region = "us-east-1" }

Write-Host "== aws s3 sync -> s3://$Bucket/ (region $region)" -ForegroundColor Cyan
aws s3 sync $RepoRoot "s3://$Bucket/" --delete --region $region `
  --exclude "node_modules/*" `
  --exclude ".git/*" `
  --exclude ".cursor/*" `
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

if (-not [string]::IsNullOrWhiteSpace($CfId)) {
  Write-Host "== CloudFront invalidation: $CfId" -ForegroundColor Cyan
  aws cloudfront create-invalidation --distribution-id $CfId --paths "/*" --region us-east-1
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Invalidation submitted (may take a few minutes)." -ForegroundColor Green
} else {
  Write-Host "SKIP: set CLOUDFRONT_DISTRIBUTION_ID to invalidate cache." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Manual checks in AWS console:" -ForegroundColor DarkGray
Write-Host "  1) S3 bucket root has index.html (also: aws s3 ls s3://$Bucket/ )" -ForegroundColor DarkGray
Write-Host "  2) CloudFront General: Default root object = index.html" -ForegroundColor DarkGray
Write-Host "  3) Origin OAC + bucket policy allows s3:GetObject (fixes AccessDenied)" -ForegroundColor DarkGray
Write-Host ""
