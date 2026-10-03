param(
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $FolderId,
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string] $BucketName,
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][uri] $JwksUrl,
  [string] $KubeconfigPath = (Join-Path $env:USERPROFILE '.kube/config-asmblyr'),
  [switch] $Resume
)
$ErrorActionPreference = 'Stop'
$identityName = 'asmblyr-collaborative-files'
$externalSubject = 'system:serviceaccount:asmblyr-collaborative-dev:core-files'
if ($JwksUrl.Scheme -ne 'https') { throw 'JWKS URL must use HTTPS' }

function Invoke-YcJson([string[]] $Arguments) {
  $result = & yc @Arguments --folder-id $folderId --format json
  if ($LASTEXITCODE -ne 0) { throw 'YC operation failed' }
  return ($result | ConvertFrom-Json)
}

# The public JWKS must belong to the intended cluster before creating trust.
$clusterKeys = kubectl --kubeconfig $kubeconfigPath get --raw /openid/v1/jwks | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot read cluster keys' }
$publishedKeys = Invoke-RestMethod -Uri $jwksUrl
if (($clusterKeys.keys.kid -join ',') -ne ($publishedKeys.keys.kid -join ',')) {
  throw 'Published JWKS do not match the Asmblyr cluster'
}

$accounts = Invoke-YcJson @('iam', 'service-account', 'list')
$account = $accounts | Where-Object name -eq $identityName
if ($account -and !$Resume) { throw 'Identity already exists; inspect before provisioning again' }
if (!$account) {
  $account = Invoke-YcJson @('iam', 'service-account', 'create', '--name', $identityName,
    '--description', 'Core files only; exact Kubernetes subject; no static keys')
}
if ($account.description -ne 'Core files only; exact Kubernetes subject; no static keys') {
  throw 'Unexpected existing account'
}

# No folder-wide IAM roles. YC requires a base bucket ACL, then the policy restricts it.
$bucket = Invoke-YcJson @('storage', 'bucket', 'list') | Where-Object name -eq $bucketName
if (!$bucket) {
  $bucket = Invoke-YcJson @('storage', 'bucket', 'create', '--name', $bucketName,
    '--default-storage-class', 'STANDARD', '--max-size', '1073741824')
}
$policy = @{
  Version = '2012-10-17'
  Statement = @(
    @{
      Sid = 'CoreFilesOnly'; Effect = 'Allow'
      Principal = @{ CanonicalUser = $account.id }
      Action = @('s3:GetObject', 's3:PutObject', 's3:DeleteObject')
      Resource = "arn:aws:s3:::$bucketName/files/*"
    },
    @{
      Sid = 'RequireTLS'; Effect = 'Deny'; Principal = '*'; Action = 's3:*'
      Resource = @("arn:aws:s3:::$bucketName", "arn:aws:s3:::$bucketName/*")
      Condition = @{ Bool = @{ 'aws:SecureTransport' = 'false' } }
    }
  )
}
$policyPath = Join-Path $PSScriptRoot 'bucket-policy.json'
[IO.File]::WriteAllText($policyPath, ($policy | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
$null = Invoke-YcJson @('storage', 'bucket', 'update', '--name', $bucketName,
  '--policy-from-file', $policyPath, '--disable-statickey-auth', 'true',
  '--grants', "grantee-id=$($account.id),grant-type=grant-type-account,permission=permission-read",
  '--grants', "grantee-id=$($account.id),grant-type=grant-type-account,permission=permission-write",
  '--public-read=false', '--public-list=false', '--public-config-read=false')

# Create disabled; enable only after the exact subject has been bound.
$federation = Invoke-YcJson @('iam', 'workload-identity', 'oidc', 'federation', 'create',
  '--name', $identityName, '--disabled', '--issuer', 'https://kubernetes.default.svc.cluster.local',
  '--jwks-url', $jwksUrl, '--audiences', 'asmblyr-collaborative-files',
  '--description', "Only $externalSubject; file bucket object access")
$credential = Invoke-YcJson @('iam', 'workload-identity', 'federated-credential', 'create',
  '--service-account-id', $account.id, '--federation-id', $federation.id,
  '--external-subject-id', $externalSubject)
if ($credential.external_subject_id -ne $externalSubject) { throw 'Unexpected subject binding' }

kubectl --kubeconfig $kubeconfigPath apply -f (Join-Path $PSScriptRoot 'service-account.yaml')
if ($LASTEXITCODE -ne 0) { throw 'Kubernetes identity creation failed' }
$null = Invoke-YcJson @('iam', 'workload-identity', 'oidc', 'federation', 'update',
  '--id', $federation.id, '--enable')

@{
  folderId = $folderId; bucket = $bucket.name; serviceAccountId = $account.id
  federationId = $federation.id; credentialId = $credential.id
  subject = $externalSubject; audience = 'asmblyr-collaborative-files'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'resources.json') -Encoding utf8
Write-Output 'Created private bucket, object-scoped identity, and exact-subject federation.'
