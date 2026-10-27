# Docker Desktop Kubernetes

This local installation uses an independent `collaborative` namespace and a
single PostgreSQL instance with a 5 GiB PVC. Core and UI run independently of
other products. Data is not imported from a developer database.

Prerequisites: PowerShell 7.4+, Docker Desktop Linux/kind, `kubectl`, Helm 3,
CloudNativePG and Traefik. The operators must watch `collaborative`; the ingress
class must be `asmblyr`, with HTTP port 80 available on loopback. The verified
operator versions are CNPG 1.30.1/chart 0.29.1 and Traefik 3.7.14/chart 42.0.0.
Existing shared operators can be used without installing another copy.

From the repository root:

```powershell
./scripts/Deploy-LocalKubernetes.ps1
# Or pass -Helm C:/tools/helm.exe if Helm is not on PATH.
```

The script validates the loopback `docker-desktop` API and kind nodes, keeps the
current context unchanged, creates PostgreSQL, preserves existing setup and
encryption secrets, builds both images from the same source and imports their
exact manifests on every node. Helm runs migrations before rollout. Database
connections verify the server certificate using a mount containing only the
public CA. The CA private key is never mounted in application Pods.

Keep a private backup of `collaborative-runtime`, especially `SECRETS_LOCAL_KEY`.
With an existing database/PVC the script refuses to generate a missing key;
restore the original Secret before deploying. Changing a key without decrypting
and re-encrypting stored values makes them unreadable. Secret resource versions
trigger rollout even when reusing the same application images.

Open `http://collaborative.localhost/setup`. The setup token is stored in
Kubernetes Secret `collaborative-runtime`, key `ASMBLYR_SETUP_TOKEN`; use a trusted
local secret viewer. Do not copy it into a committed values file. Chromium
resolves `*.localhost`; for a command-line check without editing DNS:

```powershell
curl.exe --noproxy '*' --resolve collaborative.localhost:80:127.0.0.1 http://collaborative.localhost/api/health
```

To redeploy a previously built pair, pass `-SkipBuild -ImageTag <local-tag>`.
Use `-PublicUrl http://collaborative.asmblyr.localhost` to keep that existing
local address; the old `collaborative.localhost` address then redirects to it.
This does not change users or transfer browser credentials between hosts.
Updates keep the PVC and secrets. Back up required data before migration.
Deleting the namespace, PVC or Docker VM destroys the local database; Helm
rollback does not roll back PostgreSQL. HTTP, one database replica and the local
disk are development choices, not production availability or backup guarantees.
S3 and external providers require separate configuration.

[Русский](README.ru.md)
