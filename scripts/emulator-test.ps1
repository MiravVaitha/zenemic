<#
.SYNOPSIS
  Start (or stop) the Android emulator test setup for Zenemic.

.DESCRIPTION
  One command to get from a cold laptop to a logged-in app on the emulator.
  Encodes the setup that actually works, and avoids the traps that cost a whole
  session on 2026-07-30:

    * Uses EXPO GO, not the dev build. The installed com.zenemic.app dev build
      could not complete a single authenticated request while the network,
      session, backend and JWKS all verified fine. Expo Go worked instantly.
      Rebuild the dev build (npm run android:build) before trusting it again —
      it is only needed for zenemic:// auth deep links.

    * Metro runs in ITS OWN CONSOLE WINDOW. `expo start` reads EOF and exits
      when stdin is piped, and setting CI=1 to avoid that silently DISABLES THE
      FILE WATCHER — which serves a stale bundle and makes you debug code that
      isn't running. This was the single biggest time sink.

    * Port 8082, never 8081. 8081 is the user's own Metro for physical-device
      testing and must not be touched.

    * The API goes over the adb reverse tunnel (127.0.0.1:4000), which bypasses
      the emulator NAT and any host firewall entirely. The override is passed as
      an env var; app.config.js uses plain dotenv, which does NOT overwrite an
      existing process env var, so .env.local is never modified.

.EXAMPLE
  .\scripts\emulator-test.ps1
  .\scripts\emulator-test.ps1 -Stop
#>
param(
  [switch]$Stop,
  [string]$Avd = 'Medium_Phone_API_36.1',
  [int]$MetroPort = 8082,
  [int]$BackendPort = 4000
)

$ErrorActionPreference = 'Stop'
$SDK = "$env:LOCALAPPDATA\Android\Sdk"
$ADB = "$SDK\platform-tools\adb.exe"
$EMU = "$SDK\emulator\emulator.exe"
$APP = Join-Path (Split-Path $PSScriptRoot -Parent) 'main-app'

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

function Stop-Metro {
  # Only ever the port we own. Never 8081.
  $c = Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue
  if ($c) {
    $c | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Ok "stopped Metro on $MetroPort"
  } else { Info "no Metro on $MetroPort" }
}

if ($Stop) {
  Write-Host "`nTearing down the emulator test setup..." -ForegroundColor White
  Stop-Metro
  if (Test-Path $ADB) {
    & $ADB reverse --remove-all 2>$null | Out-Null
    Ok "removed adb reverse tunnels"
    $devices = (& $ADB devices) -join "`n"
    if ($devices -match 'emulator-\d+') {
      & $ADB emu kill 2>$null | Out-Null
      Start-Sleep -Seconds 3
      Ok "emulator shut down"
    } else { Info "no emulator running" }
  }
  $left = @(8081, $BackendPort) | Where-Object {
    Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue
  }
  if ($left) { Info ("left running (yours, untouched): " + ($left -join ', ')) }
  Write-Host "`nDone.`n" -ForegroundColor White
  exit 0
}

Write-Host "`nStarting the emulator test setup..." -ForegroundColor White

# 1. Backend must already be running (Terminal 1 in TESTING.md).
try {
  Invoke-WebRequest "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 4 -UseBasicParsing | Out-Null
  Ok "backend healthy on $BackendPort"
} catch {
  Warn "backend is NOT running on $BackendPort."
  Warn "start it first:  cd backend; npm run dev:main"
  exit 1
}

# 2. Emulator.
if (-not (Test-Path $EMU)) { Warn "no Android SDK at $SDK"; exit 1 }
$devices = (& $ADB devices) -join "`n"
if ($devices -match 'emulator-\d+\s+device') {
  Ok "emulator already running"
} else {
  Info "cold-booting $Avd (a saved snapshot has hung on restore before)..."
  Start-Process -FilePath $EMU -ArgumentList "-avd",$Avd,"-no-snapshot","-no-boot-anim" -WindowStyle Minimized
  & $ADB wait-for-device
  for ($i = 0; $i -lt 60; $i++) {
    if (((& $ADB shell getprop sys.boot_completed) -join '').Trim() -eq '1') { break }
    Start-Sleep -Seconds 5
  }
  Ok "emulator booted"
}

# 3. Expo Go must be installed (see the header for why we don't use the dev build).
if (-not ((& $ADB shell pm list packages host.exp.exponent) -join '' -match 'host.exp.exponent')) {
  Warn "Expo Go is not installed on the emulator."
  Warn "get the SDK 54 apk from https://exp.host/--/api/v2/versions (sdkVersions['54.x'].androidClientUrl)"
  Warn "then:  adb install <file>.apk"
  exit 1
}
Ok "Expo Go present"

# 4. Tunnels + soft keyboard (the emulator's hardware keyboard hides the IME otherwise).
& $ADB shell settings put secure show_ime_with_hard_keyboard 1 | Out-Null
& $ADB reverse "tcp:$MetroPort" "tcp:$MetroPort" | Out-Null
& $ADB reverse "tcp:$BackendPort" "tcp:$BackendPort" | Out-Null
Ok "adb reverse: $MetroPort (metro), $BackendPort (api)"

# 5. Metro — own console so the watcher lives. NEVER set CI=1 here.
Stop-Metro
Start-Sleep -Seconds 2
Info "starting Metro on $MetroPort in its own window..."
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', "set EXPO_PUBLIC_API_URL=http://127.0.0.1:$BackendPort&& npx expo start --port $MetroPort" `
  -WorkingDirectory $APP -WindowStyle Minimized

$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 3
  try {
    if ((Invoke-WebRequest "http://127.0.0.1:$MetroPort/status" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200) { $up = $true; break }
  } catch {}
}
if (-not $up) { Warn "Metro did not come up on $MetroPort"; exit 1 }
Ok "Metro up"

# 6. Launch. First bundle build takes a couple of minutes; later ones are cached.
& $ADB shell am force-stop host.exp.exponent | Out-Null
& $ADB shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:$MetroPort" | Out-Null
Ok "launched Expo Go"

Write-Host ""
Write-Host "  Test account:  claude-e2e@example.com / ZenemicTest12345" -ForegroundColor White
Write-Host "  First bundle build takes ~2 min. Watch the Metro window." -ForegroundColor DarkGray
Write-Host "  What to test:  LAUNCH.md (Phase 0 is next)" -ForegroundColor DarkGray
Write-Host "  Tear down:     .\scripts\emulator-test.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""
