param([Parameter(Mandatory=$true)][string]$PgBin)
$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pgData = [System.IO.Path]::GetFullPath((Join-Path $workspace '.data\postgres'))
if (-not $pgData.StartsWith($workspace + [System.IO.Path]::DirectorySeparatorChar)) { throw 'PostgreSQL data must stay inside workspace' }
# ShellExecute starts the local server independently of the invoking terminal job.
Start-Process -FilePath (Join-Path $PgBin 'pg_ctl.exe') -ArgumentList @('-D', ('"' + $pgData + '"'), '-l', ('"' + (Join-Path $workspace '.data\postgres.log') + '"'), '-o', '"-p 54329 -h 127.0.0.1"', '-w', 'start') -WindowStyle Hidden
