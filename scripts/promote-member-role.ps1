#Requires -Version 5.1
<#
.SYNOPSIS
    관리자 API로 회원 role 변경 (예: 본부장 geo590603@gmail.com -> admin)

.PARAMETER TargetEmail
    변경할 회원 이메일 (기본: geo590603@gmail.com)

.PARAMETER Role
    부여할 role (기본: admin). head_daily_report 작성은 admin 또는 vip.

.PARAMETER ApiBase
    API 베이스 URL (기본: https://magicindicatorglobal.com)

환경 변수 (또는 -AdminEmail / -AdminPassword):
  MAGIC_ADMIN_EMAIL, MAGIC_ADMIN_PASSWORD
#>
[CmdletBinding()]
param(
    [string]$TargetEmail = 'geo590603@gmail.com',
    [ValidateSet('guest', 'free', 'trial', 'sub', 'vip', 'admin')]
    [string]$Role = 'admin',
    [string]$ApiBase = 'https://magicindicatorglobal.com',
    [string]$AdminEmail = $(if ($env:MAGIC_ADMIN_EMAIL) { $env:MAGIC_ADMIN_EMAIL } else { 'gjg00000@gmail.com' }),
    [string]$AdminPassword = $(if ($PSBoundParameters.ContainsKey('AdminPassword')) { $AdminPassword } elseif ($env:MAGIC_ADMIN_PASSWORD) { $env:MAGIC_ADMIN_PASSWORD } else { '' })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $AdminEmail -or -not $AdminPassword) {
    Write-Error 'MAGIC_ADMIN_EMAIL / MAGIC_ADMIN_PASSWORD 환경 변수 또는 -AdminEmail/-AdminPassword 가 필요합니다.'
}

Write-Host '참고: API 서버에 user-attach 버그가 있으면(관리자 JWT가 /api/admin/* 에서 401) VPS에서 scripts/vps-promote-user-role.sh 로 MongoDB role을 직접 변경하세요.' -ForegroundColor DarkYellow

$base = $ApiBase.TrimEnd('/')
$loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Method Post -Uri "$base/api/admin/login" -ContentType 'application/json' -Body $loginBody
if (-not $login.token) { throw 'admin login: token 없음' }

$headers = @{
    Authorization = "Bearer $($login.token)"
    'Content-Type'  = 'application/json'
}
$patchBody = @{ role = $Role; status = 'active' } | ConvertTo-Json -Compress
$enc = [uri]::EscapeDataString($TargetEmail.Trim().ToLower())
$result = Invoke-RestMethod -Method Patch -Uri "$base/api/admin/users/$enc" -Headers $headers -Body $patchBody

Write-Host "[ok] $TargetEmail -> role=$Role"
if ($result.user) {
    $result.user | ConvertTo-Json -Depth 4
}
Write-Host '본부장 계정은 로그아웃 후 다시 로그인해야 JWT에 새 role이 반영됩니다.'
