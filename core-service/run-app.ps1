# 1. Detect Java
if (Get-Command java -ErrorAction SilentlyContinue) {
    Write-Host "Java detected in system path." -ForegroundColor Green
} else {
    $env:JAVA_HOME = "D:\IoT-prac\infrastructure\oracleJdk-26"
    $env:Path = "$env:JAVA_HOME\bin;" + $env:Path
    Write-Host "JAVA_HOME set to: $env:JAVA_HOME" -ForegroundColor Green
}
java -version

# 2. Local Maven setup
$infraDir = "D:\IoT-prac\infrastructure"
$mavenDir = "$infraDir\apache-maven-3.9.5"
$mavenBin = "$mavenDir\bin"

if (-not (Test-Path $mavenBin)) {
    Write-Host "📦 Maven not found. Downloading portable version..." -ForegroundColor Cyan
    $zipPath = "$env:TEMP\maven.zip"
    $url = "https://archive.apache.org/dist/maven/maven-3/3.9.5/binaries/apache-maven-3.9.5-bin.zip"
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $zipPath
        Write-Host "📦 Extracting Maven..." -ForegroundColor Cyan
        Expand-Archive -Path $zipPath -DestinationPath $infraDir -Force
        Remove-Item $zipPath
    } catch {
        Write-Host "❌ Failed to download Maven. Please check your internet connection." -ForegroundColor Red
        exit
    }
}

$env:Path = "$mavenBin;" + $env:Path
Write-Host "✅ Maven path set to: $mavenBin" -ForegroundColor Green
mvn -version

# 3. RUN
Write-Host "Starting Core Service (Java Spring Boot)..." -ForegroundColor Cyan
# Fix: Quoting the entire -D argument for PowerShell
mvn spring-boot:run "-Dspring-boot.run.jvmArguments=-Duser.language=zh -Duser.region=TW"
