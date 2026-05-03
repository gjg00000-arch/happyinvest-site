#Requires -RunAsAdministrator
<#
  Local Windows hardening (run once).
  Administrator PowerShell:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
    cd <path>\magic-indicator-site\tools
    .\pc-harden-windows.ps1
#>
$ErrorActionPreference = "Continue"

function Write-Step($msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}

Write-Step "Firewall: enable Domain / Private / Public"
try {
  Get-NetFirewallProfile | Set-NetFirewallProfile -Enabled True
  Get-NetFirewallProfile | Select-Object Name, Enabled | Format-Table -AutoSize
} catch {
  Write-Warning $_
}

Write-Step "Microsoft Defender: baseline preferences (each isolated; failures skipped)"
$mpPrefs = @(
  @{ DisableRealtimeMonitoring = $false }
  @{ DisableIOAVProtection     = $false }
  @{ DisableBlockAtFirstSeen  = $false }
  @{ DisableTamperProtection  = $false }
)
foreach ($h in $mpPrefs) {
  try {
    Set-MpPreference @h -ErrorAction Stop
  } catch {
    Write-Host "[skip] $(($h.Keys | Sort-Object) -join ', ') : $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}
Write-Host "(If tamper protection shows 0x80004001, set it manually: Windows Security > Virus & threat protection > Manage settings.)"

foreach ($pua in @("Block", "Enabled", 2)) {
  try {
    Set-MpPreference -PUAProtection $pua -ErrorAction Stop
    Write-Host "PUAProtection set: $pua"
    break
  } catch {
    continue
  }
}

try {
  Set-MpPreference -EnableNetworkProtection Enabled
} catch {
  try { Set-MpPreference -EnableNetworkProtection 1 } catch { Write-Warning $_ }
}

Write-Step "SMBv1: disable if currently enabled"
try {
  $f = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue
  if ($f -and $f.State -eq "Enabled") {
    Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart -Confirm:$false
  } else {
    Write-Host "SMB1Protocol: already off or not present (skip)"
  }
} catch {
  Write-Warning $_
}

Write-Step "Start quick scan"
try {
  Start-MpScan -ScanType QuickScan -ErrorAction Stop
} catch {
  $m = "$($_.Exception.Message)"
  $id = "$($_.FullyQualifiedErrorId)"
  # MI RESULT 16 = scan already running (often right after Defender UI scan)
  if ($id -match "\b16\b" -or $m -match "진행 중" -or $m -match "already.*scan|scan.*already") {
    Write-Host "[skip] A scan is already running. Wait until it completes, then run Start-MpScan -ScanType QuickScan if you still want." -ForegroundColor DarkYellow
  } else {
    Write-Warning $_
  }
}

Write-Step "Defender status summary"
try {
  Get-MpComputerStatus |
    Select-Object AntivirusEnabled, RealTimeProtectionEnabled, IoavProtectionEnabled, AntivirusSignatureVersion |
    Format-List
} catch {
  Write-Warning $_
}

Write-Host ""
Write-Host "Done. Optional: full scan, Windows Update, BitLocker -> Windows Security / Settings." -ForegroundColor Green
