# Asmblyr federation test

Private smoke test for GitLab CI workload identity.

- Project ID: 87017556
- Protected branch: main
- Issuer: https://gitlab.com
- Local service account: GitLab federation test
- No data policies assigned; a successful check currently sees zero collections.

## Run

1. Set the CI/CD variable ASMBLYR_CORE_URL to the HTTPS address of your Core, reachable by the runner.
2. Open Pipelines, run a pipeline on main, then start the manual federation-smoke job.
3. A local runner may use http://127.0.0.1:3001 if it actually runs in the same network namespace as Core.
   A GitLab-hosted runner cannot reach your computer's localhost.

The audience and federation ID are non-secret identifiers for the local Asmblyr instance.
If you recreate the federation or use another instance, replace both values in .gitlab-ci.yml.
The job obtains a fresh GitLab ID token; it does not need an Asmblyr service key.
Do not enable CI_DEBUG_TRACE. No token is printed or uploaded as an artifact.
An assertion is exchanged once, with no retries. Restart the job to obtain a new assertion.

The end-to-end job has not been run yet: runner-to-Core connectivity must be configured.
