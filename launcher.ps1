param([ValidateSet('index.html','admin.html','products.html','contact.html')][string]$Page = 'index.html')

$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseUrl = 'http://localhost:4173'

function Test-CatalogServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/products" -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch { return $false }
}

if (-not (Test-CatalogServer)) {
  $node = (Get-Command node -ErrorAction Stop).Source
  Start-Process -FilePath $node -ArgumentList 'server.mjs' -WorkingDirectory $siteRoot -WindowStyle Hidden
  $ready = $false
  foreach ($attempt in 1..15) {
    Start-Sleep -Milliseconds 400
    if (Test-CatalogServer) { $ready = $true; break }
  }
  if (-not $ready) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('The Magnum catalog server could not start. Please verify that Node.js is installed.', 'MAGNUM') | Out-Null
    exit 1
  }
}

Start-Process "$baseUrl/$Page"
