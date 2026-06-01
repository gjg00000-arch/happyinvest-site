#Requires -RunAsAdministrator
<#
.SYNOPSIS
  탐색기에서 Excel 파일(.xlsx 등) 더블클릭이 안 될 때:
  shell\Open\command 아래 잘못 추가된 값 이름 'command'(보통 REG_MULTI_SZ)를 제거합니다.

.DESCRIPTION
  정상: (기본값)만 있고 EXCEL.EXE /dde 같은 REG_SZ 한 줄이어야 합니다.
  손상: 'command' 라는 이름의 값이 추가로 있으면 Explorer가 실패하는 경우가 많습니다.

  HKLM\SOFTWARE\Classes\Excel.* 전체를 스캔합니다. HKCU 쪽 사용자 재정의도 함께 정리합니다.

  관리자 PowerShell:
    Set-ExecutionPolicy -Scope Process Bypass -Force
    & "...\scripts\fix-excel-doubleclick.ps1"
#>

$ErrorActionPreference = 'Continue'

function Remove-ErrantShellCommandValue {
  param([string]$CommandKeyPath)

  if (-not (Test-Path -LiteralPath $CommandKeyPath)) { return $false }

  $props = Get-ItemProperty -LiteralPath $CommandKeyPath -ErrorAction SilentlyContinue
  if ($null -eq $props) { return $false }
  if (-not ($props.PSObject.Properties.Name -contains 'command')) { return $false }

  Write-Host "Removing errant 'command' value from: $CommandKeyPath" -ForegroundColor Yellow
  try {
    Remove-ItemProperty -LiteralPath $CommandKeyPath -Name 'command' -Force -ErrorAction Stop
    return $true
  } catch {
    Write-Host " (!) Failed: $_" -ForegroundColor Red
    return $false
  }
}

$removed = 0
foreach ($classesRoot in @('HKLM:\SOFTWARE\Classes', 'HKCU:\SOFTWARE\Classes')) {
  if (-not (Test-Path -LiteralPath $classesRoot)) { continue }

  Write-Host "== Scanning under $classesRoot" -ForegroundColor Cyan
  Get-ChildItem -LiteralPath $classesRoot -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -like 'Excel.*' } |
    ForEach-Object {
      $cmdPath = Join-Path $classesRoot ($_.PSChildName + '\shell\Open\command')
      if (Remove-ErrantShellCommandValue -CommandKeyPath $cmdPath) { $script:removed++ }
    }
}

Write-Host ''
if ($removed -gt 0) {
  Write-Host "Removed $removed errant 'command' value(s). Try double-clicking .xlsx / .csv again." -ForegroundColor Green
} else {
  Write-Host "No extra 'command' values found under Excel.* Open\command. If open still fails, try Office Repair." -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '== After fix: Excel.Sheet.12 Open\command (should be only (default), no extra "command" name)' -ForegroundColor Cyan
& reg.exe query 'HKLM\SOFTWARE\Classes\Excel.Sheet.12\shell\Open\command' 2>$null

Write-Host ''
Write-Host 'If Excel still opens empty/gray after double-click: Excel > 파일 > 옵션 > 고급 > 일반 >' -ForegroundColor DarkGray
Write-Host '  "동적 데이터 교환(DDE)을 사용하는 다른 응용 프로그램 무시" 체크 해제 후 재시도.' -ForegroundColor DarkGray
