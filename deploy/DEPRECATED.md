# Deprecated: Windows PowerShell deploy scripts

The `deploy/*.ps1` scripts in this directory are **deprecated** and no longer
the supported deployment path for FlowOps.

| Script | What it did | Replaced by |
|---|---|---|
| `flowops-go-live.ps1` | Build & stage frontend + backend on a Windows host. Copied `backend/.env.production` raw into a release dir. | `docker-compose.yml` at the repo root + AWS task definitions (TBD; see `docs/DEPLOYMENT.md`). |
| `flowops-deploy-frontend-production.ps1` | Robocopy frontend dist into `C:\deploy\flowops\frontend-dist`. | Container image push to ECR / DockerHub. |
| `flowops-deploy-backend-production.ps1` | Robocopy backend bundle. | Backend image push (in the backend repo). |
| `flowops-start-backend-production.ps1` | `npm start` on a Windows host. | ECS task / Fargate / EKS deployment. |
| `flowops-postgres-backup.ps1` | `pg_dump` to a Windows path. | RDS automated snapshots + `pg_dump` to S3 in CI. |
| `flowops-postgres-restore-template.ps1` | `pg_restore` template. | RDS point-in-time restore. |
| `nginx-flowops-example.conf` | Reverse proxy on a Windows IIS-adjacent setup. | `frontend/nginx.conf` (now a Docker template; ALB / CloudFront for TLS in prod). |

## Why deprecated

1. They assumed a Windows host (`C:\flowops\...`). The AWS migration target is Linux containers.
2. `flowops-go-live.ps1` copied `backend/.env.production` into the release dir uncensored — secrets ride along into release artifacts.
3. They referenced a `backend/` directory that isn't in this repo today.
4. There was no CI integration — deploys were manual.

## Should I delete them?

**Not yet.** Keeping them in-tree until:

1. The AWS migration plan in `docs/DEPLOYMENT.md` is signed off.
2. The replacement CI pipeline (image build + ECR push + task definition update) is live.
3. Whoever ran these scripts on the previous Windows host confirms there's no value left in them as a runbook reference.

After all three: `git rm -r deploy/`.

## Where to look instead

- **Local development & local containerised testing:** `docker-compose.yml` at the repo root.
- **Production deployment plan:** `docs/DEPLOYMENT.md`.
- **Frontend container reference:** `frontend/Dockerfile` + `frontend/nginx.conf`.
