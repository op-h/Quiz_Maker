@echo off
setlocal EnableExtensions

set "SITE_ORIGIN=https://quiz.op-h.tech"
set "MODEL=llama3.2"

if not "%~1"=="" set "SITE_ORIGIN=%~1"
if not "%~2"=="" set "MODEL=%~2"

set "OLLAMA_CLI="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$cmd = Get-Command ollama -ErrorAction SilentlyContinue; if ($cmd) { $cmd.Source }"`) do set "OLLAMA_CLI=%%I"

if not defined OLLAMA_CLI set "OLLAMA_CLI=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
for %%I in ("%OLLAMA_CLI%") do set "OLLAMA_DIR=%%~dpI"
set "OLLAMA_APP=%OLLAMA_DIR%ollama app.exe"

echo [1/6] Checking Ollama installation...
if not exist "%OLLAMA_CLI%" (
  echo Ollama was not found. Installing from the official Windows installer...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://ollama.com/install.ps1 | iex"
  if errorlevel 1 goto :fail
)

if not exist "%OLLAMA_CLI%" (
  echo ERROR: Ollama install finished, but "%OLLAMA_CLI%" was not found.
  echo Open https://ollama.com/download/windows and install it once manually, then run this file again.
  goto :fail
)

echo [2/6] Ensuring OLLAMA_ORIGINS contains %SITE_ORIGIN%...
set "UPDATED_OLLAMA_ORIGINS="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$required = '%SITE_ORIGIN%';" ^
  "$values = @();" ^
  "foreach ($source in @($env:OLLAMA_ORIGINS, [Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'User'))) { if ($source) { $values += $source -split ',' } }" ^
  "$parts = $values | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique;" ^
  "if ($parts -notcontains $required) { $parts += $required }" ^
  "$updated = $parts -join ',';" ^
  "[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', $updated, 'User');" ^
  "[Console]::Out.Write($updated)"`) do set "UPDATED_OLLAMA_ORIGINS=%%I"
if errorlevel 1 goto :fail
if not defined UPDATED_OLLAMA_ORIGINS (
  echo ERROR: Could not determine the final OLLAMA_ORIGINS value.
  goto :fail
)
set "OLLAMA_ORIGINS=%UPDATED_OLLAMA_ORIGINS%"
echo Active OLLAMA_ORIGINS for this run: %OLLAMA_ORIGINS%

echo [3/6] Restarting Ollama...
taskkill /IM "ollama app.exe" /F >nul 2>&1
taskkill /IM "ollama.exe" /F >nul 2>&1
timeout /t 2 /nobreak >nul

if exist "%OLLAMA_APP%" (
  start "" "%OLLAMA_APP%"
) else (
  start "" "%OLLAMA_CLI%" serve
)

echo [4/6] Waiting for Ollama to become ready...
set "READY=0"
for /L %%N in (1,1,30) do (
  "%OLLAMA_CLI%" list >nul 2>&1
  if not errorlevel 1 (
    set "READY=1"
    goto :ready
  )
  timeout /t 1 /nobreak >nul
)

:ready
if not "%READY%"=="1" (
  echo ERROR: Ollama did not become ready in time.
  goto :fail
)

echo [5/6] Checking whether model %MODEL% is already installed...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$model = '%MODEL%';" ^
  "$output = & '%OLLAMA_CLI%' list 2>$null | Out-String;" ^
  "if ($LASTEXITCODE -ne 0) { exit 2 }" ^
  "if ($output -match ('(?m)^' + [regex]::Escape($model) + '(:|\s|$)')) { exit 0 } else { exit 1 }"
set "MODEL_STATUS=%ERRORLEVEL%"

if "%MODEL_STATUS%"=="2" (
  echo ERROR: Could not query the local Ollama model list.
  goto :fail
)

if "%MODEL_STATUS%"=="1" (
  echo Pulling %MODEL%...
  "%OLLAMA_CLI%" pull %MODEL%
  if errorlevel 1 goto :fail
) else (
  echo Model %MODEL% is already installed.
)

echo [6/6] Done.
echo.
echo Ollama is ready for %SITE_ORIGIN%
echo Use these AI Studio settings:
echo   Provider: Ollama (Free Local)
echo   Endpoint: http://127.0.0.1:11434/api/chat
echo   Model: %MODEL%
echo   API key: leave blank
exit /b 0

:fail
echo.
echo Setup failed.
exit /b 1
