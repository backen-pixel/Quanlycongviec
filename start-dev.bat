@echo off
REM Double-click để chạy backend + frontend (mở 2 cửa sổ PowerShell).
REM Truyền tham số: start-dev.bat -Install  (cài lại deps trước khi chạy)
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start-dev.ps1" %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo Co loi xay ra. Bam phim bat ky de dong...
  pause >nul
)
