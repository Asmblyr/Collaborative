#requires -Version 7.4
[CmdletBinding()]
param([Parameter(Mandatory)][string[]] $Images)

$ErrorActionPreference = 'Stop'
$taskConfig = kubectl --context docker-desktop config view --minify -o json | ConvertFrom-Json
if ($LASTEXITCODE) { throw 'Docker Desktop Kubernetes is unavailable.' }
$taskServer = [Uri]$taskConfig.clusters[0].cluster.server
if ($taskServer.Scheme -ne 'https' -or $taskServer.Host -notin @('127.0.0.1', 'localhost', '[::1]')) {
    throw 'Only the local Docker Desktop API is supported.'
}
$taskNodes = (kubectl --context docker-desktop get nodes -o json | ConvertFrom-Json).items.metadata.name
if ($LASTEXITCODE -or !$taskNodes -or @($taskNodes | Where-Object { $_ -notmatch '^desktop-(control-plane|worker[0-9]*)$' }).Count) {
    throw 'Expected local Docker Desktop kind nodes.'
}

function Read-ImageTargets([string] $NodeName) {
    $taskRows = docker --context desktop-linux exec $NodeName ctr -n k8s.io images list
    if ($LASTEXITCODE) { throw "Could not inspect images on $NodeName." }
    $taskTargets = @{}
    foreach ($taskRow in @($taskRows | Select-Object -Skip 1)) {
        $taskColumns = $taskRow -split '\s+'
        if ($taskColumns.Count -ge 3) { $taskTargets[$taskColumns[0]] = $taskColumns[2] }
    }
    return $taskTargets
}

$taskInstalled = @{}
foreach ($taskImage in $Images) {
    if ($taskImage -cnotmatch '\Acollaborative-(core|ui):[a-z0-9][a-z0-9.-]{0,80}\z') { throw 'Expected an explicit local Collaborative image.' }
    $taskInspect = docker --context desktop-linux image inspect $taskImage | ConvertFrom-Json -Depth 30
    if ($LASTEXITCODE -or @($taskInspect).Count -ne 1) { throw 'Local image is unavailable.' }
    $taskInspect = @($taskInspect)[0]
    $taskDescriptor = $taskInspect.Descriptor
    if ($taskInspect.Os -ne 'linux' -or $taskInspect.Architecture -ne 'amd64' -or
        $taskDescriptor.mediaType -notin @('application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json') -or
        $taskDescriptor.digest -cnotmatch '\Asha256:[a-f0-9]{64}\z') {
        throw 'Build one Linux/amd64 image with --provenance=false.'
    }
    $taskRepository = 'docker.io/library/' + ($taskImage -split ':')[0]
    $taskReference = $taskRepository + '@' + $taskDescriptor.digest
    foreach ($taskNode in $taskNodes) {
        $taskTargets = Read-ImageTargets $taskNode
        if ($taskTargets[$taskReference] -cne $taskDescriptor.digest) {
            docker --context desktop-linux save $taskInspect.Id | docker --context desktop-linux exec -i $taskNode ctr -n k8s.io images import --local --digests - | Out-Host
            if ($LASTEXITCODE) { throw "Image import failed on $taskNode." }
            $taskTargets = Read-ImageTargets $taskNode
            $taskSource = @($taskTargets.Keys | Where-Object { $taskTargets[$_] -ceq $taskDescriptor.digest } | Sort-Object)[0]
            if (!$taskSource) { throw 'Captured image manifest is missing after import.' }
            docker --context desktop-linux exec $taskNode ctr -n k8s.io images tag --force $taskSource $taskReference | Out-Host
            if ($LASTEXITCODE) { throw 'Could not register the immutable image.' }
        }
        $taskConfirmed = docker --context desktop-linux exec $taskNode crictl inspecti -o json $taskReference | ConvertFrom-Json -Depth 30
        if ($LASTEXITCODE -or $taskReference -notin $taskConfirmed.status.repoDigests) { throw "Image verification failed on $taskNode." }
        Write-Host "${taskNode}: verified $taskReference"
    }
    $taskInstalled[$taskImage] = $taskReference
}
return $taskInstalled
