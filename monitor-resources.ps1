# monitor-resources.ps1 - Battery Project Resource Monitor
# Usage: Run .\monitor-resources.ps1 to see real-time stats

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🔋 Battery Digital Twin - Real-time Resource Monitor      " -ForegroundColor Cyan
Write-Host "Monitoring Target: java.exe, node.exe                      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

while($true) {
    # 獲取處理器核心數 (用於計算各進程佔比)
    $coreCount = (Get-WmiObject -Class Win32_Processor).NumberOfCores
    
    $stats = Get-Process | Where-Object { $_.ProcessName -match "java|node" } | Select-Object `
        Id, 
        ProcessName, 
        @{Name='CPU(%)'; Expression={ [Math]::Round($_.CPU / $coreCount, 2) }},
        @{Name='RAM(MB)'; Expression={ [Math]::Round($_.WorkingSet / 1MB, 2) }},
        @{Name='Threads'; Expression={ $_.Threads.Count }}

    $timestamp = Get-Date -Format "HH:mm:ss"
    
    # 清除舊數據 (模擬刷新效果)
    $host.ui.RawUI.CursorPosition = New-Object System.Management.Automation.Host.Coordinates(0, 5)
    
    Write-Host "Snapshot Time: $timestamp" -ForegroundColor Gray
    Write-Host "----------------------------------------------------------"
    
    if ($stats) {
        $stats | Format-Table -AutoSize
    } else {
        Write-Host "Waiting for processes to start... (java/node)" -ForegroundColor Yellow
    }

    Write-Host "----------------------------------------------------------"
    Write-Host "Tips: Watch 'Threads' for potential deadlock / starvation." -ForegroundColor DarkGray
    Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
    
    Start-Sleep -Seconds 1
}
