@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo AutoManual Studio Starting...
echo ===================================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Dependencies not found. Installing now...
    echo This may take a few minutes. Please wait.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies.
        echo Please check your internet connection and Node.js installation.
        pause
        exit /b %ERRORLEVEL%
    )
    echo [INFO] Dependencies installed successfully.
)

:: Start the Next.js development server
echo [INFO] Starting the development server...
echo [INFO] Your browser will open automatically in a few seconds.
echo.

:: Open browser in a separate process after a short delay to allow server to start
start "" cmd /c "timeout /t 5 >nul && start http://localhost:3000"

:: Run the dev server
call npm run dev

pause
