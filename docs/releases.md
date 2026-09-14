# Releasing Survey Tentacles

Run these commands from the repository root in PowerShell. The scripts require Git; deployment also requires Docker Compose v2. PowerShell 7 is recommended.

## Choose the exact version

Commit and push the reviewed source changes to `main` first, including the release tooling on its first use. Then preview a release:

```powershell
.\scripts\release.ps1 -Version v1.7.2 -Preview
```

When the preview is correct:

```powershell
.\scripts\release.ps1 -Version v1.7.2
```

Use your chosen version in place of the example. There is no `-Bump` parameter. The script accepts `v1.7.2` or `1.7.2`, normalizes the tag to `v1.7.2`, and rejects malformed versions, existing local or remote tags, and versions no newer than the current version.

It requires a clean working tree on `main`, with local HEAD matching remote main. It uses the existing `survey-tentacles` remote; use `-Remote origin` in clones with that remote name.

The script writes `backend/gradle.properties`, commits that one file, creates an annotated tag, and atomically pushes only the main branch and that tag. It never pushes unrelated tags, force-pushes, or deploys production. Preview checks the remote but changes no files or Git refs.

`backend/gradle.properties` is the version source. Gradle reads it automatically, including for the generated UI footer and the Docker build. Do not manually edit the version in `build.gradle` or Compose. The release script maintains it for you.

## Wait for publication

Watch the **Build and Publish Docker Image** workflow in GitHub Actions. It validates that the tag matches the version file, runs Java, browser-logic, and release-tooling tests, and then publishes:

- `ghcr.io/eiredrake/survey_tentacles:v1.7.2`
- `ghcr.io/eiredrake/survey_tentacles:1.7.2`

It creates the GitHub Release after the image is published. The workflow does not move `latest`; deployments use explicit version tags. Compilation runs on GitHub, not in the production Docker host.

If the push fails, the local release commit and tag remain for inspection. An atomic push cannot partially update the branch and tag, but a lost network response can leave its outcome uncertain. Inspect both remote refs before retrying. Do not delete or overwrite an existing published tag to reuse a version. A failed Actions run may be rerun at the same commit; code fixes should receive a new version.

## Deploy separately

After publication succeeds, run on the Windows production Docker host with this repository available:

```powershell
.\scripts\deploy.ps1 -Version v1.7.2 -EnvFile C:\path\to\production\.env -Preview
.\scripts\deploy.ps1 -Version v1.7.2 -EnvFile C:\path\to\production\.env
```

Omit `-Version` to use the version in `backend/gradle.properties`. Omit `-EnvFile` only if the repository-root `.env` contains the correct production configuration. In particular, production uploads must be `/app/uploads`, not the Windows dev directory. No secrets are printed or committed.

Deployment uses the repository's `infra/docker-compose.yml`, the existing `survey-tentacles` project, and existing `tentacles` / `tentacles-db` containers. It checks that the database is running and both named volumes match the resolved Compose configuration before updating anything. Installations with different names or mounts must reconcile their configuration first; this script does not migrate them.

The script temporarily supplies `TENTACLES_VERSION` to Compose, pulls the exact image, recreates only the application with `--no-deps`, and checks `/health` on localhost port 8080. It does not restart PostgreSQL, remove volumes, or change NPM or Authentik. A failed image pull leaves the running app alone. A failed health check reports failure and the previous image; it does not automatically roll back database migrations.

To deploy a different published version, pass it explicitly to `deploy.ps1`. Review schema compatibility before rolling back. The selected image remains on the container; the script does not rewrite the production `.env`. Use this script for subsequent updates, or set `TENTACLES_VERSION` yourself when using Compose directly.

## Checks without releasing

```powershell
.\scripts\test-release.ps1
.\scripts\test-deploy.ps1
```

These integration checks create disposable repositories and a local bare remote. They test actual commit/tag/push behavior and rejection paths without contacting GitHub or Docker. No live release is created while setting up this tooling.

Deployment checks use a fake Docker executable to verify project/volume rejection, pull failure, application-only recreation, and environment restoration. They never contact the live Docker daemon.
