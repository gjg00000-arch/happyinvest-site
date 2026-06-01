#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Mouse without Borders (Microsoft Garage) 레지스트리·남은 파일 정리.

.NOTES
  1) 관리자 PowerShell에서 실행하세요.
  2) 먼저 [앱]에서 제거하거나, 이 스크립트가 MSI 제거를 시도합니다.
  3) 보안 키·MachinePool 등 설정은 모두 삭제됩니다.
#>
$ErrorActionPreference = 'Continue'

Write-Host '== Stopping Mouse without Borders processes' -ForegroundColor Cyan
@('MouseWithoutBorders', 'MouseWithoutBordersHelper', 'mwb_daemon') | ForEach-Object {
  Get-Process -Name $_ -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Remove-RegTree {
  param([string]$LiteralPath)
  if (Test-Path -LiteralPath $LiteralPath) {
    Write-Host "Removing registry: $LiteralPath" -ForegroundColor Yellow
    Remove-Item -LiteralPath $LiteralPath -Recurse -Force
  }
}

Write-Host '== Uninstall via registry Uninstall key (if present)' -ForegroundColor Cyan
$uninstallRoots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($root in $uninstallRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue
    if ($p.DisplayName -match 'Mouse without Borders|MouseWithoutBorders|Garage.*Mouse') {
      Write-Host " Found: $($p.DisplayName)" -ForegroundColor Gray
      if ($p.UninstallString) {
        Write-Host " Running: $($p.UninstallString)" -ForegroundColor Gray
        if ($p.PSChildName -match '^\{[A-Fa-f0-9-]+\}$') {
          $code = $p.PSChildName.Trim('{}')
          Start-Process msiexec.exe -ArgumentList @('/x', "{$code}", '/qn', '/norestart') -Wait -NoNewWindow
        } elseif ($p.UninstallString -match 'MsiExec\.exe.*\{([A-Fa-f0-9-]+)\}') {
          $code = $Matches[1]
          Start-Process msiexec.exe -ArgumentList @('/x', "{$code}", '/qn', '/norestart') -Wait -NoNewWindow
        } else {
          $us = $p.UninstallString.Trim()
          if ($us -match '^"([^"]+)"\s*(.*)$') {
            $exe = $Matches[1]; $args = $Matches[2]
            Start-Process -FilePath $exe -ArgumentList $args -Wait -NoNewWindow
          } else {
            cmd.exe /c $us
          }
        }
      }
    }
  }
}

Start-Sleep -Seconds 2
Get-Process -Name 'MouseWithoutBorders*','mwb*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host '== Removing known registry trees' -ForegroundColor Cyan
foreach ($p in @(
    'HKCU:\Software\Microsoft\MouseWithoutBorders',
    'HKLM:\Software\Microsoft\MouseWithoutBorders',
    'HKLM:\Software\WOW6432Node\Microsoft\MouseWithoutBorders'
  )) {
  Remove-RegTree $p
}

# Garage 아래 다른 앱이 있을 수 있으니 이름에 Mouse 가 들어가는 하위 키만 제거
foreach ($garage in @('HKCU:\Software\Microsoft\Garage', 'HKLM:\Software\Microsoft\Garage')) {
  if (-not (Test-Path -LiteralPath $garage)) { continue }
  Get-ChildItem -LiteralPath $garage -ErrorAction SilentlyContinue | Where-Object {
    $_.PSChildName -match 'Mouse|Without|Borders|Mwb'
  } | ForEach-Object {
    Write-Host "Removing registry: $($_.PSPath)" -ForegroundColor Yellow
    Remove-Item -LiteralPath $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host '== Removing Uninstall registry remnants (by display name match)' -ForegroundColor Cyan
foreach ($root in $uninstallRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
    $prop = Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue
    if ($prop.DisplayName -match 'Mouse without Borders|MouseWithoutBorders|Garage.*Mouse') {
      Write-Host " Removing Uninstall key: $($_.PsPath)" -ForegroundColor Yellow
      Remove-Item -LiteralPath $_.PsPath -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

# 제품 코드로 남는 Orphan 항목 (표시 이름이 비었거나 패턴 불일치 시)
$knownProductCodes = @(
  '{D3BC954F-D661-474C-B367-30EB6E56542E}' # Microsoft Garage Mouse without Borders (일반적인 ProductCode)
)
Write-Host '== Removing Uninstall keys by known ProductCode (orphan cleanup)' -ForegroundColor Cyan
foreach ($code in $knownProductCodes) {
  foreach ($root in $uninstallRoots) {
    Remove-RegTree (Join-Path $root $code)
  }
}

Write-Host '== Removing install folders (Mouse without Borders only)' -ForegroundColor Cyan
$folders = @(
  "$env:APPDATA\Microsoft\MouseWithoutBorders",
  "$env:LOCALAPPDATA\Microsoft\MouseWithoutBorders",
  (Join-Path $env:ProgramFiles 'Microsoft Garage\Mouse without Borders'),
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Garage\Mouse without Borders')
)
foreach ($d in $folders) {
  if (Test-Path -LiteralPath $d) {
    Write-Host " Removing folder: $d" -ForegroundColor Yellow
    Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host 'Done. Reboot recommended if the app was running or uninstall just ran.' -ForegroundColor Green
Write-Host 'If anything remains, check: Settings > Apps > Installed apps > Mouse without Borders > Uninstall' -ForegroundColor DarkGray
