#requires -Version 7.4
[CmdletBinding()]
param(
    [switch] $SkipBuild,
    [string] $PublicUrl = 'http://collaborative.localhost',
    [string] $SessionCookieDomain = '',
    [ValidatePattern('^[a-z0-9][a-z0-9.-]{0,80}$')]
    [string] $ImageTag = ('local-' + (Get-Date -Format 'yyyyMMdd-HHmmss')),
    [string] $Helm = 'helm'
)

$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$taskNamespace = 'collaborative'

function Invoke-Kubectl {
    & kubectl --context docker-desktop --request-timeout=30s @args
    if ($LASTEXITCODE) { throw "Local kubectl failed: $($args[0])" }
}

function Apply-Object([object] $Value) {
    $Value | ConvertTo-Json -Depth 30 -Compress | & kubectl --context docker-desktop apply --server-side --field-manager=collaborative-local -f -
    if ($LASTEXITCODE) { throw 'Local Kubernetes object could not be applied.' }
}

function Read-Secret([string] $Name) {
    $taskJson = Invoke-Kubectl -n $taskNamespace get secret $Name --ignore-not-found -o json
    if ($taskJson) { return $taskJson | ConvertFrom-Json -AsHashtable }
    return $null
}

function New-RandomToken { return [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

$taskConfig = Invoke-Kubectl config view --minify -o json | ConvertFrom-Json
$taskServer = [Uri]$taskConfig.clusters[0].cluster.server
if ($taskServer.Scheme -ne 'https' -or $taskServer.Host -notin @('127.0.0.1', 'localhost', '[::1]')) { throw 'Only Docker Desktop loopback Kubernetes is supported.' }
$taskNodes = (Invoke-Kubectl get nodes -o json | ConvertFrom-Json).items
if (!$taskNodes -or @($taskNodes | Where-Object { $_.metadata.name -notmatch '^desktop-(control-plane|worker[0-9]*)$' }).Count) { throw 'Expected Docker Desktop kind nodes.' }
Invoke-Kubectl get crd clusters.postgresql.cnpg.io | Out-Host
Invoke-Kubectl get ingressclass asmblyr | Out-Host
& $Helm version --short
if ($LASTEXITCODE) { throw 'Helm is required.' }

Push-Location $taskRoot
try {
    $taskPreviousDatabase = Invoke-Kubectl -n $taskNamespace get cluster collaborative-db --ignore-not-found -o name
    $taskPreviousVolumes = Invoke-Kubectl -n $taskNamespace get pvc -l cnpg.io/cluster=collaborative-db --ignore-not-found -o name
    $taskPreviousRuntime = Read-Secret 'collaborative-runtime'
    if (($taskPreviousDatabase -or $taskPreviousVolumes) -and !$taskPreviousRuntime.data.SECRETS_LOCAL_KEY) {
        throw 'A retained database requires its original SECRETS_LOCAL_KEY. Restore collaborative-runtime before deploying; generating a new key would make existing secrets unreadable.'
    }
    Invoke-Kubectl apply -f deploy/local/kubernetes/database.yaml | Out-Host
    & kubectl --context docker-desktop -n $taskNamespace wait cluster/collaborative-db --for=condition=Ready --timeout=300s
    if ($LASTEXITCODE) { throw 'PostgreSQL is not ready; existing data is preserved.' }
    $taskDatabase = Read-Secret 'collaborative-db-app'
    $taskCa = Read-Secret 'collaborative-db-ca'
    if (!$taskDatabase -or !$taskCa.data.'ca.crt') { throw 'CNPG credentials or CA are unavailable.' }
    # Publish only the public CA, never mount the operator's CA private key.
    Apply-Object @{ apiVersion = 'v1'; kind = 'Secret'; metadata = @{ name = 'collaborative-db-client-ca'; namespace = $taskNamespace }; data = @{ 'ca.crt' = $taskCa.data.'ca.crt' } }
    $taskUser = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($taskDatabase.data.username))
    $taskPassword = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($taskDatabase.data.password))
    $taskUrl = 'postgresql://' + [Uri]::EscapeDataString($taskUser) + ':' + [Uri]::EscapeDataString($taskPassword) + '@collaborative-db-rw.collaborative.svc:5432/collaborative?sslmode=verify-full&sslrootcert=/run/secrets/postgres-ca/ca.crt'
    $taskRuntime = Read-Secret 'collaborative-runtime'
    $taskData = if ($taskRuntime) { $taskRuntime.data } else { @{} }
    foreach ($taskKey in @('SECRETS_LOCAL_KEY', 'ASMBLYR_SETUP_TOKEN')) {
        if (!$taskData[$taskKey]) { $taskData[$taskKey] = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((New-RandomToken))) }
    }
    $taskData.DATABASE_URL = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($taskUrl))
    Apply-Object @{ apiVersion = 'v1'; kind = 'Secret'; metadata = @{ name = 'collaborative-runtime'; namespace = $taskNamespace }; data = $taskData }
    $taskRuntimeVersion = (Read-Secret 'collaborative-runtime').metadata.resourceVersion
    $taskCaVersion = (Read-Secret 'collaborative-db-client-ca').metadata.resourceVersion

    if (!$SkipBuild) {
        foreach ($taskComponent in @('core', 'ui')) {
            & docker --context desktop-linux build --platform linux/amd64 --provenance=false --target $taskComponent --build-arg "DEPLOYMENT_VERSION=$ImageTag" -t "collaborative-${taskComponent}:$ImageTag" .
            if ($LASTEXITCODE) { throw "Image build failed: $taskComponent" }
        }
    }
    $taskImages = & (Join-Path $PSScriptRoot 'Install-LocalKubernetesImages.ps1') -Images @("collaborative-core:$ImageTag", "collaborative-ui:$ImageTag")
    $taskValues = @{
        images = @{
            core = @{ repository = 'docker.io/library/collaborative-core'; digest = ($taskImages["collaborative-core:$ImageTag"] -split '@')[1] }
            ui = @{ repository = 'docker.io/library/collaborative-ui'; digest = ($taskImages["collaborative-ui:$ImageTag"] -split '@')[1] }
        }
        publicUrl = $PublicUrl
        publicUrlAliases = @(if ($PublicUrl -eq 'http://collaborative.asmblyr.localhost') { 'http://collaborative.localhost' })
        sessionCookiePrefix = 'collaborative'
        sessionCookieDomain = $SessionCookieDomain
        existingSecret = 'collaborative-runtime'
        ingress = @{ className = 'asmblyr' }
        coreSecretFiles = @(@{ name = 'postgres-ca'; secretName = 'collaborative-db-client-ca' })
        podAnnotations = @{
            'collaborative.local/image-tag' = $ImageTag
            'collaborative.local/secret-version' = $taskRuntimeVersion
            'collaborative.local/ca-version' = $taskCaVersion
        }
    }
    $taskOutput = Join-Path $taskRoot '.local-data/kubernetes'
    New-Item -ItemType Directory -Force $taskOutput | Out-Null
    $taskValuesPath = Join-Path $taskOutput 'values.json'
    $taskValues | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 $taskValuesPath
    & $Helm upgrade --install local deploy/helm/collaborative --kube-context docker-desktop --namespace $taskNamespace --values $taskValuesPath --wait --timeout 5m
    if ($LASTEXITCODE) { throw 'Collaborative did not become ready. Inspect events; credentials and data are preserved.' }
    if ($PublicUrl -eq 'http://collaborative.asmblyr.localhost') {
        # Keep old browser bookmarks usable without copying credentials between hosts.
        Invoke-Kubectl apply -f deploy/local/kubernetes/legacy-address.yaml | Out-Host
    } else {
        Invoke-Kubectl delete -f deploy/local/kubernetes/legacy-address.yaml --ignore-not-found | Out-Host
    }
    Write-Host "Collaborative: $PublicUrl"
}
finally { Pop-Location }
