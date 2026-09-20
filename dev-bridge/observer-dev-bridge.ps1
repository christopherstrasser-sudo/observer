param(
    [string]$Repository = "https://github.com/christopherstrasser-sudo/observer.git",
    [string]$Branch = "main",
    [string]$Target = "C:\Observer",
    [string]$BridgeRoot = "C:\ObserverDevBridge",
    [int]$PollSeconds = 10,
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$RepoDir = Join-Path $BridgeRoot "repo"
$LogDir = Join-Path $BridgeRoot "logs"
$LogFile = Join-Path $LogDir "observer-dev-bridge.log"

function Write-Log {
    param(
        [ValidateSet("INFO", "WARN", "ERROR", "OK")]
        [string]$Level,
        [string]$Message
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"

    switch ($Level) {
        "ERROR" { Write-Host $line -ForegroundColor Red }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        "OK"    { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line }
    }

    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found in PATH."
    }
}

function Invoke-Git {
    param([string[]]$Arguments)

    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)"
    }

    return $output
}

function Ensure-Repository {
    if (Test-Path (Join-Path $RepoDir ".git")) {
        return
    }

    if (Test-Path $RepoDir) {
        Write-Log "WARN" "Removing incomplete bridge cache at $RepoDir"
        Remove-Item $RepoDir -Recurse -Force
    }

    Write-Log "INFO" "Cloning repository cache..."
    Invoke-Git @("clone", "--branch", $Branch, "--single-branch", $Repository, $RepoDir) | Out-Null
    Write-Log "OK" "Repository cache created."
}

function Get-LocalCommit {
    try {
        return ((Invoke-Git @("-C", $RepoDir, "rev-parse", "HEAD")) | Select-Object -First 1).Trim()
    }
    catch {
        return ""
    }
}

function Get-RemoteCommit {
    $result = Invoke-Git @("ls-remote", $Repository, "refs/heads/$Branch")
    if (-not $result) {
        throw "Could not resolve remote branch '$Branch'."
    }

    return (($result | Select-Object -First 1) -split "\s+")[0].Trim()
}

function Update-Repository {
    Write-Log "INFO" "Fetching latest '$Branch'..."
    Invoke-Git @("-C", $RepoDir, "fetch", "--prune", "origin", $Branch) | Out-Null
    Invoke-Git @("-C", $RepoDir, "checkout", "-f", $Branch) | Out-Null
    Invoke-Git @("-C", $RepoDir, "reset", "--hard", "origin/$Branch") | Out-Null
    Invoke-Git @("-C", $RepoDir, "clean", "-fdx") | Out-Null
}

function Sync-Target {
    if (-not (Test-Path $Target)) {
        New-Item -ItemType Directory -Path $Target -Force | Out-Null
    }

    Write-Log "INFO" "Synchronizing repository to $Target"

    $arguments = @(
        $RepoDir,
        $Target,
        "/MIR",
        "/R:2",
        "/W:1",
        "/NFL",
        "/NDL",
        "/NJH",
        "/NJS",
        "/NP",
        "/XD", ".git", "node_modules", "data", "logs",
        "/XF", ".env"
    )

    & robocopy @arguments | Out-Null
    $code = $LASTEXITCODE

    if ($code -ge 8) {
        throw "robocopy failed with exit code $code."
    }
}

function Sync-Latest {
    $local = Get-LocalCommit
    $remote = Get-RemoteCommit

    if ($local -eq $remote -and (Test-Path $Target)) {
        return $false
    }

    if ($local -ne $remote) {
        $shortLocal = if ($local) { $local.Substring(0, [Math]::Min(7, $local.Length)) } else { "none" }
        $shortRemote = $remote.Substring(0, [Math]::Min(7, $remote.Length))
        Write-Log "INFO" "New revision detected: $shortLocal -> $shortRemote"
        Update-Repository
    }
    else {
        Write-Log "INFO" "Target directory missing. Re-deploying current revision."
    }

    Sync-Target

    $commit = Get-LocalCommit
    $shortCommit = $commit.Substring(0, [Math]::Min(7, $commit.Length))
    Write-Log "OK" "Observer updated successfully to $shortCommit."
    return $true
}

try {
    New-Item -ItemType Directory -Path $BridgeRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

    Assert-Command "git"
    Assert-Command "robocopy"

    Write-Log "INFO" "Observer Dev Bridge started."
    Write-Log "INFO" "Repository: $Repository"
    Write-Log "INFO" "Branch: $Branch"
    Write-Log "INFO" "Target: $Target"
    Write-Log "INFO" "Bridge cache: $RepoDir"

    Ensure-Repository

    # Always make the first run deterministic, even when the cache already exists.
    Update-Repository
    Sync-Target

    $initialCommit = Get-LocalCommit
    $initialShort = $initialCommit.Substring(0, [Math]::Min(7, $initialCommit.Length))
    Write-Log "OK" "Initial sync complete at $initialShort."

    if ($Once) {
        Write-Log "INFO" "One-shot mode complete."
        exit 0
    }

    Write-Log "INFO" "Watching for updates every $PollSeconds seconds. Press Ctrl+C to stop."

    while ($true) {
        Start-Sleep -Seconds $PollSeconds

        try {
            [void](Sync-Latest)
        }
        catch {
            Write-Log "ERROR" $_.Exception.Message
            Write-Log "WARN" "Will retry on the next poll."
        }
    }
}
catch {
    try {
        Write-Log "ERROR" $_.Exception.Message
    }
    catch {
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    }

    exit 1
}
