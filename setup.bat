@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  ShieldDesigner - Setup and Launch
echo ============================================
echo.

:: Check Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYVER=%%i
echo [OK] Found %PYVER%

:: Check if .env exists
if not exist ".env" (
    echo.
    echo [WARNING] .env file not found!
    echo Creating a template .env file - you must fill in your credentials.
    echo.
    (
        echo SUPABASE_URL=https://your-project.supabase.co
        echo SUPABASE_ANON_KEY=your_anon_key_here
        echo SUPABASE_BUCKET=ShieldBucket
        echo SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
        echo FLASK_SECRET_KEY=change_this_to_a_random_string
        echo ADMIN_USER=admin
        echo ADMIN_PASS_HASH=
    ) > .env
    echo [!] A blank .env has been created. Please edit it with your Supabase credentials.
    echo     Then re-run this script.
    echo.
    notepad .env
    pause
    exit /b 1
)
echo [OK] .env file found

:: Create virtual environment if it doesn't exist
if not exist "venv\" (
    echo.
    echo [SETUP] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
) else (
    echo [OK] Virtual environment already exists
)

:: Activate venv
call venv\Scripts\activate.bat

:: Upgrade pip silently
echo.
echo [SETUP] Updating pip...
python -m pip install --upgrade pip --quiet

:: Install dependencies
echo [SETUP] Installing dependencies from requirements.txt...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)
echo [OK] All dependencies installed

:: Launch the app
echo.
echo ============================================
echo  Launching ShieldDesigner on port 8080
echo  Access it at: http://localhost:8080
echo  Network access: http://YOUR_IP:8080
echo  Press Ctrl+C to stop
echo ============================================
echo.
python app.py

pause
