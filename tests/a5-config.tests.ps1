$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$iniPath = Join-Path $repoRoot "Clash-A5.ini"
$basePath = Join-Path $repoRoot "Clash-A5-Base.yaml"
$workerPath = Join-Path $repoRoot "workers/sub-yaml-worker.js"

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

Assert-True (Test-Path -LiteralPath $iniPath) "Clash-A5.ini does not exist"
Assert-True (Test-Path -LiteralPath $basePath) "Clash-A5-Base.yaml does not exist"

$ini = Get-Content -Raw -LiteralPath $iniPath
$base = Get-Content -Raw -LiteralPath $basePath
$worker = Get-Content -Raw -LiteralPath $workerPath

$groupLines = @($ini -split "`r?`n" | Where-Object { $_ -match '^custom_proxy_group=' })
$expectedGroups = @(
    'custom_proxy_group=🔰 默认代理`select`.*',
    'custom_proxy_group=🌐 国外`select`[]🔰 默认代理',
    'custom_proxy_group=🏠 国内`select`[]DIRECT'
)

Assert-True ($groupLines.Count -eq 3) "Clash-A5.ini must define exactly 3 proxy groups"
foreach ($expectedGroup in $expectedGroups) {
    Assert-True ($groupLines -contains $expectedGroup) "Missing proxy group: $expectedGroup"
}

$forbiddenRuleTargets = @(
    '🤖 OpenAI', '👽 Anthropic', '💻 编程', '🐦 社交', '💰 投资',
    '🎮 游戏', '🥽 Meta', '📺 Youtube', '🎬 Netflix', '🔍 Google',
    '📄 Microsoft', '🩳 托底'
)
foreach ($target in $forbiddenRuleTargets) {
    Assert-True (-not $base.Contains(",$target")) "A5 rules still reference business group: $target"
}

Assert-True ($base -match '(?m)^\s*- MATCH,🏠 国内\s*$') "A5 must end unmatched traffic at domestic"
Assert-True ($base -match '(?m)^\s*- GEOSITE,geolocation-!cn,🌐 国外\s*$') "A5 must route foreign domains to foreign"
Assert-True ($base -match '(?m)^\s*- AND,.*GEOIP,CN.*🌐 国外\s*$') "A5 must keep the Stash-compatible foreign IPv4 rule"
Assert-True ($base -match '(?m)^\s*- DOMAIN-SUFFIX,ts\.net,DIRECT\s*$') "A5 must keep Tailscale direct routing"

Assert-True ($worker.Contains('a5: "聚合优选-简化版"')) "Worker display name does not include A5"
Assert-True ($worker.Contains('Clash-A5.ini')) "Worker config map does not include Clash-A5.ini"
Assert-True ($worker.Contains('url.searchParams.has("a5")')) "Worker short parameter handling does not include A5"
Assert-True ($worker.Contains('A1, A2, A3, A4 or A5')) "Worker validation message does not include A5"

Write-Host "A5 configuration checks passed"
