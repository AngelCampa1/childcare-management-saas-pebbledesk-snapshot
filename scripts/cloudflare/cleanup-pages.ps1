param(
	# Override with -ConfirmedProjectNames only after inventory confirms the exact PebbleDesk projects.
	[string[]]$ConfirmedProjectNames = @("pebbledesk-web", "pebbledesk-site", "pebbledesk"),
	[string[]]$RequiredWorkerDomains = @(
		"https://my.pebbledesk.app/",
		"https://pebbledesk.app/",
		"https://www.pebbledesk.app/",
		"https://api.pebbledesk.app/api/health"
	),
	[switch]$WorkerDomainsConfirmed,
	[switch]$SkipDomainVerification
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
	param([string]$Message)
	Write-Host "==> $Message"
}

function Assert-WorkersOwnProductionDomains {
	if (-not $WorkerDomainsConfirmed) {
		throw "Pass -WorkerDomainsConfirmed only after Cloudflare inventory confirms these domains are bound to Workers, not Pages."
	}

	if ($SkipDomainVerification) {
		Write-Step "Skipping production domain verification by request"
		return
	}

	foreach ($url in $RequiredWorkerDomains) {
		Write-Step "Verifying Worker-backed production domain $url"
		$response = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing
		if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
			throw "Domain verification failed for $url with status $($response.StatusCode)"
		}
	}
}

function Invoke-WranglerJson {
	param(
		[Parameter(Mandatory = $true)]
		[string[]]$Arguments
	)

	$raw = & pnpm exec wrangler @Arguments --json 2>$null
	if ($LASTEXITCODE -ne 0) {
		throw "wrangler $($Arguments -join ' ') failed"
	}

	if ([string]::IsNullOrWhiteSpace($raw)) {
		return @()
	}

	return @($raw | ConvertFrom-Json)
}

function Get-CloudflarePagesProjectName {
	param([Parameter(Mandatory = $true)]$Project)

	foreach ($property in @("name", "project_name", "Project Name")) {
		if ($Project.PSObject.Properties.Name -contains $property) {
			return [string]$Project.$property
		}
	}

	return ""
}

Assert-WorkersOwnProductionDomains

Write-Step "Listing Cloudflare Pages projects"
# Equivalent Wrangler command: wrangler pages project list --json
$projects = Invoke-WranglerJson -Arguments @("pages", "project", "list")
$existingProjectNames = @($projects | ForEach-Object { Get-CloudflarePagesProjectName -Project $_ })
$projectsToDelete = @($ConfirmedProjectNames | Where-Object { $existingProjectNames -contains $_ })

if ($projectsToDelete.Count -eq 0) {
	Write-Step "No confirmed PebbleDesk Pages projects found"
	return
}

foreach ($projectName in $projectsToDelete) {
	Write-Step "Deleting confirmed PebbleDesk Pages project '$projectName'"
	pnpm exec wrangler pages project delete $projectName --yes | Out-Host
	if ($LASTEXITCODE -ne 0) {
		throw "Failed deleting Pages project '$projectName'"
	}
}
