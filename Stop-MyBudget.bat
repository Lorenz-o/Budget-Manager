@echo off
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = [IO.Path]::GetFullPath('%~dp0');" ^
  "$procs = Get-CimInstance Win32_Process | Where-Object {" ^
  "  $_.Name -match '^python.*\.exe$' -and" ^
  "  $_.CommandLine -and" ^
  "  $_.CommandLine.Contains($root) -and" ^
  "  ($_.CommandLine -match 'standalone_server\.py' -or $_.CommandLine -match 'backend[\\/]app\.py')" ^
  "};" ^
  "if (-not $procs) { Write-Host 'MyBudget non è in esecuzione.'; exit 0 };" ^
  "$procs | ForEach-Object { Write-Host ('Arresto MyBudget - PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force };" ^
  "Write-Host 'MyBudget arrestato.'"

pause
chcp 65001 >nul
title Stop MyBudget
REM Ferma solo il server MyBudget avviato dal launcher.
REM La scheda del browser puo' restare aperta, ma non avra' piu' un server dietro.
call "%~dp0Avvia-MyBudget.bat" stop
