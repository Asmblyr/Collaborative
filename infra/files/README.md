# Yandex Cloud file storage setup

These are operator tools for a separately configured installation. They require
the Yandex Cloud CLI, kubectl, and management access to the intended folder and
cluster. They are not run by the application or its test suite.

```powershell
./infra/files/provision.ps1 `
  -FolderId '<your-folder-id>' `
  -BucketName '<your-private-bucket>' `
  -JwksUrl 'https://your-public-jwks-host.example/cluster-jwks.json' `
  -KubeconfigPath '<path-to-your-kubeconfig>'
```

The script compares the published JWKS with the selected cluster before creating
a private bucket, workload identity federation and exact-subject binding. It
creates the `asmblyr-collaborative-dev/core-files` Kubernetes identity. Review its
resource names and IAM/object permissions before running it. `-Resume` is not an
idempotent reconciliation mode.

Generated `resources.json` and `bucket-policy.json` describe that installation and
are excluded from Git and Docker build contexts. Keep them locally for:

```powershell
./infra/files/verify-federation.ps1 -KubeconfigPath '<path-to-your-kubeconfig>'
```

The verification makes temporary object/policy changes and cleans up its probes.
`-InitializeBucketAcl` additionally changes the bucket ACL; review that operation
before using it. It is not a read-only health check.
