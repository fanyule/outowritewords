$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

& node ".\scripts\dev-local-suite.cjs" @args
exit $LASTEXITCODE
