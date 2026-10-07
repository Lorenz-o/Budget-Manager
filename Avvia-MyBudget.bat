@echo off
chcp 65001 >nul
title MyBudget
REM Avvio di MyBudget: controlla/installa tutto il necessario e apre il browser.
REM   Avvia-MyBudget.bat        -> avvia
REM   Avvia-MyBudget.bat stop   -> chiude MyBudget
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MyBudget.ps1" %*
if errorlevel 1 pause
