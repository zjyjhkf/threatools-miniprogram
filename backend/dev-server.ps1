# Jianheng API launcher (Windows PowerShell)
# Keeps running in the foreground: close this window to stop the server.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$port = 8000

Write-Host '============================================'
Write-Host " Jianheng API  -  http://127.0.0.1:$port"
Write-Host ' Keep this window open. Close it to stop the server.'
Write-Host '============================================'
Write-Host ''

try {
    # [0/3] kill stale server by command line (netstat may report PID 0)
    Write-Host "[0/3] freeing port $port ..."
    $stale = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*uvicorn*app.main:app*' }
    if ($stale) {
        foreach ($proc in $stale) {
            Write-Host ('       stopping old server PID ' + $proc.ProcessId)
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    } else {
        Write-Host '       no stale server found'
    }

    $py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path $py)) {
        Write-Host '[1/3] creating venv and installing deps ...'
        python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'venv creation failed' }
        & $py -m pip install --disable-pip-version-check -q -r requirements.txt
        if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }
    } else {
        Write-Host '[1/3] python deps ready'
    }

    Write-Host '[2/3] sync database schema and seed data ...'
    & $py -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'alembic upgrade failed' }
    & $py -m scripts.seed
    if ($LASTEXITCODE -ne 0) { throw 'seed failed' }
    # 管理端依赖 admin_users；幂等，已存在则跳过
    & $py -m scripts.seed_admin
    if ($LASTEXITCODE -ne 0) { throw 'seed_admin failed' }

    Write-Host '[3/3] starting server, press Ctrl+C to stop'
    & $py -m uvicorn app.main:app --host 127.0.0.1 --port $port
    if ($LASTEXITCODE -ne 0) { throw "uvicorn exited with code $LASTEXITCODE" }
} catch {
    Write-Host ''
    Write-Host ('Startup failed: ' + $_.Exception.Message)
    Write-Host 'Check:'
    Write-Host "  - port $port is free        netstat -ano | findstr :$port"
    Write-Host '  - MySQL service is running  Get-Service *mysql*'
    Write-Host '  - backend\.env DATABASE_URL is correct'
    Read-Host 'Press Enter to exit'
}
