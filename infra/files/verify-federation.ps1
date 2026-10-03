param(
  [switch] $InitializeBucketAcl,
  [ValidatePattern('^outside-prefix-smoke-[a-f0-9-]{36}$')][string] $ProbeKey,
  [string] $KubeconfigPath = (Join-Path $env:USERPROFILE '.kube/config-asmblyr')
)
$ErrorActionPreference = 'Stop'
$resources = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'resources.json') -Raw | ConvertFrom-Json
$base = 'https://storage.yandexcloud.net/' + $resources.bucket

function Exchange([string] $ServiceAccount, [string] $Audience) {
  $assertion = kubectl --kubeconfig $kubeconfigPath -n asmblyr-collaborative-dev create token $ServiceAccount --audience $Audience --duration 10m
  if ($LASTEXITCODE -ne 0) { throw 'Kubernetes token creation failed' }
  return Invoke-RestMethod -Method Post -Uri 'https://auth.yandex.cloud/oauth/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
    grant_type = 'urn:ietf:params:oauth:grant-type:token-exchange'
    requested_token_type = 'urn:ietf:params:oauth:token-type:access_token'
    audience = $resources.serviceAccountId; subject_token = $assertion
    subject_token_type = 'urn:ietf:params:oauth:token-type:id_token'
  }
}
function Assert-Denied([scriptblock] $Action, [string] $Label, [int[]] $StatusCodes = @(403)) {
  try { $null = & $Action } catch {
    if ($_.Exception.Response.StatusCode.value__ -in $StatusCodes) {
      Write-Output ($Label + ': denied'); return
    }
    throw ($Label + ': unexpected HTTP status ' + $_.Exception.Response.StatusCode.value__)
  }
  throw ($Label + ': unexpectedly allowed')
}

# A failed negative trust check prevents any ACL mutation.
Assert-Denied { Exchange 'default' 'asmblyr-collaborative-files' } 'Different subject' @(400, 401, 403)
Assert-Denied { Exchange 'core-files' 'wrong-audience' } 'Different audience' @(400, 401, 403)
$identity = Exchange 'core-files' 'asmblyr-collaborative-files'
$headers = @{ Authorization = ('Bearer ' + $identity.access_token) }
Write-Output 'Exact subject/audience: federation exchange passed'

if ($InitializeBucketAcl) {
  # YC docs: IAM OR bucket ACL -> bucket policy -> STS. Bucket ACL does not bypass policy.
  # https://yandex.cloud/en/docs/storage/security/overview#scheme
  $state = yc storage bucket get --name $resources.bucket --full --format json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Cannot read bucket policy' }
  $allow = @($state.policy.Statement | Where-Object Effect -eq 'Allow')
  if ($state.acl.grants.Count -gt 0 -or $state.folder_id -ne $resources.folderId -or
    $state.anonymous_access_flags.read -or $state.anonymous_access_flags.list -or
    $state.anonymous_access_flags.config_read -or !$state.disabled_statickey_auth -or
    $allow.Count -ne 1 -or $allow[0].Principal.CanonicalUser -ne $resources.serviceAccountId -or
    $allow[0].Resource -ne "arn:aws:s3:::$($resources.bucket)/files/*" -or
    (($allow[0].Action | Sort-Object) -join ',') -ne 's3:DeleteObject,s3:GetObject,s3:PutObject') {
    throw 'Unexpected bucket access state; no changes applied'
  }
  $null = yc storage bucket update --name $resources.bucket --folder-id $resources.folderId `
    --grants "grantee-id=$($resources.serviceAccountId),grant-type=grant-type-account,permission=permission-read" `
    --grants "grantee-id=$($resources.serviceAccountId),grant-type=grant-type-account,permission=permission-write" --format json
  if ($LASTEXITCODE -ne 0) { throw 'Cannot set base ACL' }
}

$key = 'files/federation-smoke-' + [guid]::NewGuid().ToString()
$outsideKey = if ($ProbeKey) { $ProbeKey } else { 'outside-prefix-smoke-' + [guid]::NewGuid().ToString() }
$uploaded = $false
$outsideUploaded = $false
$probePolicyActive = $false
$originalPolicy = Join-Path $PSScriptRoot 'bucket-policy.json'
$probePolicyPath = Join-Path $env:TEMP ('asmblyr-files-probe-' + [guid]::NewGuid() + '.json')
function Set-ProbePolicy([bool] $Enable) {
  $path = if ($Enable) { $probePolicyPath } else { $originalPolicy }
  $null = yc storage bucket update --name $resources.bucket --policy-from-file $path --format json
  if ($LASTEXITCODE -ne 0) { throw 'Cannot set probe bucket policy' }
}
function Invoke-Probe([string] $Method) {
  # Policy propagation may lag the management API response.
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try {
      $params = @{ UseBasicParsing = $true; Method = $Method; Uri = "$base/$outsideKey"; Headers = $headers }
      if ($Method -eq 'Put') { $params.Body = 'asmblyr-outside-prefix-probe' }
      $null = Invoke-WebRequest @params
      return
    } catch {
      if ($_.Exception.Response.StatusCode.value__ -ne 403 -or $attempt -eq 9) { throw }
      Start-Sleep -Milliseconds 750
    }
  }
}
$checksFailed = $false
try {
  # Test an existing outside-prefix object; 404 on a missing key proves nothing.
  # Temporarily permit only this SA and this random synthetic key to seed/clean it.
  $probePolicy = Get-Content -LiteralPath $originalPolicy -Raw | ConvertFrom-Json
  $probePolicy.Statement += @{
    Sid = 'IsolatedVerificationProbe'; Effect = 'Allow'
    Principal = @{ CanonicalUser = $resources.serviceAccountId }
    Resource = "arn:aws:s3:::$($resources.bucket)/$outsideKey"
    Action = @('s3:GetObject', 's3:PutObject', 's3:DeleteObject')
  }
  [IO.File]::WriteAllText($probePolicyPath, ($probePolicy | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
  Set-ProbePolicy $true
  $probePolicyActive = $true
  Invoke-Probe 'Put'
  $outsideUploaded = $true
  Set-ProbePolicy $false
  $probePolicyActive = $false
  $null = Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$base/$key" -Headers $headers -ContentType 'text/plain' -Body 'asmblyr-federation-smoke'
  $uploaded = $true
  $download = Invoke-WebRequest -UseBasicParsing -Uri "$base/$key" -Headers $headers
  if ($download.Content -ne 'asmblyr-federation-smoke') { throw 'Content mismatch' }
  Write-Output 'Object PUT/GET: passed'
  Assert-Denied { Invoke-WebRequest -UseBasicParsing -Uri "$base/$key" } 'Anonymous object GET'
  Assert-Denied { Invoke-WebRequest -UseBasicParsing -Uri "$base/?list-type=2" -Headers $headers } 'Bucket listing'
  # YC allows reading the bucket's own policy with its base read ACL.
  # Writing that same policy must still be denied (no configuration-admin grant).
  $samePolicy = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'bucket-policy.json') -Raw
  Assert-Denied { Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$base/?policy" -Headers $headers -ContentType 'application/json' -Body $samePolicy } 'Bucket policy write'
  Assert-Denied { Invoke-WebRequest -UseBasicParsing -Uri "$base/$outsideKey" -Headers $headers } 'Outside prefix GET'
  Assert-Denied { Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$base/$outsideKey" -Headers $headers -Body 'denied' } 'Outside prefix PUT'
  $null = Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$base/$key" -Headers $headers
  $uploaded = $false
  Write-Output 'Object DELETE: passed'
} catch {
  $checksFailed = $true
  if ($uploaded) {
    try { $null = Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$base/$key" -Headers $headers; $uploaded = $false }
    catch { Write-Warning ('Cleanup needed for probe object: ' + $key) }
  }
  throw
} finally {
  if ($outsideUploaded) {
    try {
      Set-ProbePolicy $true
      $probePolicyActive = $true
      Invoke-Probe 'Delete'
      Write-Output 'Outside probe cleanup: passed'
    } finally { Set-ProbePolicy $false; $probePolicyActive = $false }
  }
  if ($probePolicyActive) { Set-ProbePolicy $false }
  if ($checksFailed -and $InitializeBucketAcl) {
    $null = yc storage bucket update --name $resources.bucket --acl private --format json
  }
  Remove-Item -LiteralPath $probePolicyPath -Force -ErrorAction SilentlyContinue
  if ($uploaded -and !$InitializeBucketAcl) {
    $null = Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$base/$key" -Headers $headers
  }
  Remove-Variable identity,headers -ErrorAction SilentlyContinue
}
