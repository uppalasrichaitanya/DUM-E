# Mission capture helper — screenshots the DUM-E window at mission milestones.
# Usage: powershell -File tools/capture-floor.ps1 -OutDir docs/screenshots/mission
# (capture-floor.ps1 already restores minimized windows and saves to the given dir)
param([string]$OutDir = "docs/screenshots/mission")

# Reuse the proven capture script with a mission-specific output dir
& "$PSScriptRoot\capture-floor.ps1" -OutDir $OutDir
