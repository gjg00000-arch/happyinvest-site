#Requires -RunAsAdministrator
<#
.SYNOPSIS
  [프로그램 추가/제거]에 남은 Mouse without Borders MSI 잔여 키만 삭제합니다.

.NOTES
  ProductCode: {D3BC954F-D661-474C-B367-30EB6E56542E}
  HKLM Uninstall(64·32비트 뷰) 두 곳을 모두 정리합니다.
#>
$ErrorActionPreference = 'Continue'

$guid = '{D3BC954F-D661-474C-B367-30EB6E56542E}'
$roots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)

foreach ($root in $roots) {
  $path = Join-Path $root $guid
  if (Test-Path -LiteralPath $path) {
    Write-Host "Removing: $path" -ForegroundColor Yellow
    Remove-Item -LiteralPath $path -Recurse -Force
    Write-Host "OK removed." -ForegroundColor Green
  } else {
    Write-Host "Not found (already clean): $path" -ForegroundColor DarkGray
  }
}

Write-Host ''
Write-Host 'Done. If Add/Remove Programs still shows a ghost entry, reboot and check again.' -ForegroundColor Green
