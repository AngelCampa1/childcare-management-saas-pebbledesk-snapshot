param(
	[ValidateSet("start", "stop", "restart", "status")]
	[string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $repoRoot ".local\dev-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$services = @(
	@{
		Name = "api"
		Port = 8790
		WorkDir = Join-Path $repoRoot "apps\api"
		Command = '$host.ui.RawUI.WindowTitle = "PebbleDesk API"; Set-Location "' + (Join-Path $repoRoot "apps\api") + '"; pnpm --filter @pebbledesk/api dev --ip 127.0.0.1 --port 8790'
	},
	@{
		Name = "web"
		Port = 3040
		WorkDir = Join-Path $repoRoot "apps\web"
		Command = '$host.ui.RawUI.WindowTitle = "PebbleDesk Web"; Set-Location "' + (Join-Path $repoRoot "apps\web") + '"; $env:VITE_DEV_API_TARGET="http://127.0.0.1:8790"; pnpm --filter @pebbledesk/web dev --host 127.0.0.1 --port 3040 --strictPort'
	},
	@{
		Name = "site"
		Port = 4321
		WorkDir = Join-Path $repoRoot "apps\site"
		Command = '$host.ui.RawUI.WindowTitle = "PebbleDesk Site"; Set-Location "' + (Join-Path $repoRoot "apps\site") + '"; $env:PUBLIC_APP_URL="http://127.0.0.1:3040"; pnpm --filter @pebbledesk/site dev --host 127.0.0.1 --port 4321'
	}
)

function Get-ListenerProcessInfo {
	param([int]$Port)

	$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
		Select-Object -First 1
	if (-not $listener) {
		return $null
	}

	$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" |
		Select-Object -First 1
	if (-not $process) {
		return $null
	}

	return [pscustomobject]@{
		ProcessId = $process.ProcessId
		Name = $process.Name
		CommandLine = $process.CommandLine
	}
}

function Test-IsPebbleDeskProcess {
	param($ProcessInfo)

	return $null -ne $ProcessInfo -and $ProcessInfo.CommandLine -like "*$repoRoot*"
}

function Wait-ForPort {
	param(
		[int]$Port,
		[int]$TimeoutSeconds = 30
	)

	for ($attempt = 0; $attempt -lt $TimeoutSeconds; $attempt++) {
		if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
			return $true
		}
		Start-Sleep -Seconds 1
	}

	return $false
}

function Stop-ServiceListener {
	param($Service)

	$processInfo = Get-ListenerProcessInfo -Port $Service.Port
	if (-not $processInfo) {
		Write-Host "[$($Service.Name)] not running"
		return
	}

	if (-not (Test-IsPebbleDeskProcess -ProcessInfo $processInfo)) {
		throw "Port $($Service.Port) is in use by a non-PebbleDesk process ($($processInfo.Name) $($processInfo.ProcessId)). Refusing to stop it."
	}

	Stop-Process -Id $processInfo.ProcessId -Force
	Write-Host "[$($Service.Name)] stopped process $($processInfo.ProcessId) on port $($Service.Port)"
}

function Start-ServiceListener {
	param($Service)

	$processInfo = Get-ListenerProcessInfo -Port $Service.Port
	if ($processInfo) {
		if (-not (Test-IsPebbleDeskProcess -ProcessInfo $processInfo)) {
			throw "Port $($Service.Port) is in use by a non-PebbleDesk process ($($processInfo.Name) $($processInfo.ProcessId)). Refusing to start a duplicate."
		}

		Write-Host "[$($Service.Name)] reusing existing PebbleDesk process $($processInfo.ProcessId) on port $($Service.Port)"
		return
	}

	$outLog = Join-Path $logDir "$($Service.Name).out.log"
	$errLog = Join-Path $logDir "$($Service.Name).err.log"
	$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Service.Command))

	Start-Process powershell.exe `
		-WorkingDirectory $Service.WorkDir `
		-ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand) `
		-RedirectStandardOutput $outLog `
		-RedirectStandardError $errLog | Out-Null

	if (-not (Wait-ForPort -Port $Service.Port)) {
		throw "[$($Service.Name)] failed to start on port $($Service.Port). Check $errLog"
	}

	$startedProcess = Get-ListenerProcessInfo -Port $Service.Port
	Write-Host "[$($Service.Name)] started process $($startedProcess.ProcessId) on port $($Service.Port)"
}

switch ($Action) {
	"status" {
		foreach ($service in $services) {
			$processInfo = Get-ListenerProcessInfo -Port $service.Port
			if (-not $processInfo) {
				Write-Host "[$($service.Name)] stopped"
				continue
			}

			$owner = if (Test-IsPebbleDeskProcess -ProcessInfo $processInfo) { "PebbleDesk" } else { "external" }
			Write-Host "[$($service.Name)] $owner process $($processInfo.ProcessId) on port $($service.Port)"
		}
	}
	"stop" {
		foreach ($service in $services) {
			Stop-ServiceListener -Service $service
		}
	}
	"restart" {
		foreach ($service in $services) {
			Stop-ServiceListener -Service $service
		}
		foreach ($service in $services) {
			Start-ServiceListener -Service $service
		}
	}
	"start" {
		foreach ($service in $services) {
			Start-ServiceListener -Service $service
		}
	}
}
