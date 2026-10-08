# GitLab federation check

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

A GitLab CI workload-identity example. Configure your own federation with issuer
https://gitlab.com, a protected branch, and exact project/job-project identifiers.
Values in .gitlab-ci.yml must match your installation. A service without policies
can authenticate but cannot access collections.

## Run

1. Set ASMBLYR_CORE_URL in CI/CD variables to an HTTPS Core address reachable by the runner.
2. Run a pipeline on protected main and start the manual federation-smoke job.
3. A local runner can use http://127.0.0.1:3001 only in Core's network namespace.
   A hosted runner cannot reach your computer's localhost.

Audience/federation IDs are nonsecret identifiers. Replace them in .gitlab-ci.yml
for another installation. The job obtains a fresh GitLab ID token without a
permanent Collaborative service key. Do not enable CI_DEBUG_TRACE. Tokens are
neither printed nor uploaded. Assertions are exchanged once without retries;
restart the job for a fresh assertion. End-to-end verification requires working
runner-to-Core connectivity.
