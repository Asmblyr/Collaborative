# LavinMQ and OAuth/OIDC

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

An optional example connecting an external application to Collaborative's OAuth/OIDC provider. It neither starts with Core nor is required by the admin.

Provide Docker Compose, configured Core OAuth, persistent signing keys, and a registered application. See [integrations](../../docs/features/integrations.md).

From the repository root:

```sh
node examples/oauth-lavinmq/setup.mjs
```

This creates .local-data/oauth-lavinmq/lavinmq.ini without replacing an existing file. Enter the registered application's settings, then start:

```sh
docker compose -f examples/oauth-lavinmq/compose.yaml up -d
```

The gateway is at `http://localhost:15673`. Broker settings/data stay private.

For personal permissions, enable policy-managed application access. Add lavinmq.tag:monitoring and lavinmq.tag:administrator with readable labels and assign them to different policies. Keep mgmt_scopes = openid profile email. Audience and resource_server_id must match the application's Audience, for example lavinmq. Rights arrive in resource_access.lavinmq.roles, not shared mgmt_scopes. Preferred_username_claims = email,sub displays email instead of UUID.

Localhost HTTP is only for this example. Public installations require HTTPS and correct issuer, origins, and redirect URI.

Run the optional core-lavinmq live test through scripts/test.mjs using variables described in apps/core/test/oauth-lavinmq.integration.test.ts. Ordinary suites skip it without a configured broker.
