# FlowOps deployment plan

> Status: skeleton. Filled in across PR #9 (this PR — Docker production-readiness) and follow-up PRs as the AWS migration decisions land.

## Goals

1. **One containerised deployment artefact per service.** Same image runs locally, in CI, and in production.
2. **AWS-ready on day one** without locking into AWS — Cloudflare R2 for waybill assets, anything else portable.
3. **No secrets on disk in production containers.** Secrets come from AWS Secrets Manager / SSM at task-definition time.
4. **Reproducible builds.** Lockfile committed (PR #2), image tags pinned, build args documented.
5. **Backwards compatible during migration.** The platform was already live; users with stale localStorage / stale Service Worker caches keep working through the transition.

## Current state (after PR #9)

| Component | State |
|---|---|
| Frontend container | ✅ Multi-stage `Dockerfile` (npm + lockfile + cache mount + HEALTHCHECK + ARM64-friendly base). `nginx.conf` is now a runtime template — backend hostname / port substituted by `NGINX_ENVSUBST_FILTER` whitelist at container start. |
| Frontend dev container | ✅ `target: development` runs Vite with `--host 0.0.0.0`. Used for `docker compose up --build frontend` against a remote backend. |
| Frontend `.dockerignore` | ✅ Added. Image build context excludes `node_modules`, `dist`, `.git`, `coverage`, `playwright-report`, `e2e`, `.env*` (except example files), and editor metadata. |
| `docker-compose.yml` | ✅ Application stack: `frontend` + `api` (image-only stub) + `postgres:16-alpine` + `redis:7-alpine`. Healthchecks on every service. Networks + named volumes. |
| Backend container | ❌ Backend repo location not yet shared. Compose service slot is ready; just needs `BACKEND_IMAGE=ghcr.io/.../flowops-backend:tag` once the backend repo starts pushing. |
| Observability stack | ⚠️ `docker-compose.otel.yml` runs Jaeger + Prometheus + OTel collector. Dev-only (CORS, env labels). Production target undecided — see "Decisions still open". |
| Windows deploy scripts | 🪦 Marked deprecated in `deploy/DEPRECATED.md`. Will be deleted after AWS migration sign-off. |
| CI image build/push | ✅ Done in PR #11. `frontend-image` job builds amd64 (smoke-test), then multi-arch (amd64 + arm64) push to `ghcr.io/<owner>/<repo>-frontend`. Smoke test asserts `/healthz`, the index page, and every hardened response header. Tag scheme: `latest` on default-branch push, semver tags on `v*` push, `sha-<short>` on every push. |
| Secrets in CI workflow | ✅ `JWT_SECRET` now reads from `${{ secrets.JWT_SECRET }}` (PR #11). The previous hardcoded `test-jwt-secret-for-ci` is gone. If the secret is unset on a forked PR, the backend tests fail loudly rather than silently using a known-leaked value. |
| Secrets in `deploy/`'s `flowops-go-live.ps1` | 🔴 Copies `backend/.env.production` raw into the release dir. Until that script is deleted, the host running it must be trusted. |
| Frontend `dist/` in git history | ⚠️ Older commits track build artefacts. `.gitignore` already excludes them. New commits will not. |

## Target architecture (proposed for AWS)

```
                              ┌──────────────────────────────────────┐
                              │         CloudFront / Route 53        │
                              │   (TLS termination, edge caching)    │
                              └──────────────────────────────────────┘
                                              │
                          ┌───────────────────┼────────────────────┐
                          ▼                   ▼                    ▼
                  ┌─────────────┐     ┌─────────────────┐    ┌───────────────┐
                  │ S3: SPA     │     │  ALB (private)   │    │ Cloudflare R2 │
                  │ /index.html │     │  hosts /api/*    │    │ Waybills,     │
                  │ /assets/*   │     └────────┬─────────┘    │ POD/POC       │
                  └─────────────┘              ▼              │ artefacts     │
                                       ┌─────────────────┐    └───────────────┘
                                       │ ECS Fargate:    │
                                       │ flowops-api     │
                                       │ (backend image) │
                                       └────────┬────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              ▼                                   ▼
                   ┌────────────────────┐              ┌─────────────────────┐
                   │ RDS Postgres 16    │              │ ElastiCache Redis 7 │
                   │ (multi-AZ)         │              │ (single node OK)    │
                   └────────────────────┘              └─────────────────────┘
```

Why this shape:

- **Frontend on S3 + CloudFront, NOT in ECS.** An SPA is static files; running nginx in ECS just to serve them is overkill. S3+CF is cheaper, edge-cached, no autoscaling concerns.
  - The `frontend/Dockerfile` ↑ stays useful for local development, CI smoke tests, and as a fallback. But the production deploy uploads `dist/` to S3.
- **Backend on ECS Fargate.** No EC2 to manage. Tasks scale on CPU/memory. Hooks cleanly into ALB target groups via the `/health` endpoint.
- **RDS Postgres + ElastiCache Redis.** Managed = backups, multi-AZ, point-in-time recovery for free.
- **Cloudflare R2 for waybill / POD / POC assets** as discussed previously. S3-compatible API; avoids egress cost vs. S3 if Cloudflare is already in the path. Backend issues presigned URLs (15-30 min TTL).
- **Secrets via SSM Parameter Store / Secrets Manager**, mounted into task definitions. Never in container images, never on disk.

## Decisions still open

| Decision | Default if no answer | Where to note when decided |
|---|---|---|
| AWS account / region | `us-east-1` (cheapest, most services) | Update Terraform/CDK module when added. |
| Container registry | ECR (recommended; AWS IAM-aware) vs. Docker Hub vs. GHCR | Update `.github/workflows/ci.yml` push job (PR #10). |
| Frontend hosting | **S3 + CloudFront** (recommended) vs. nginx container in ECS | If S3+CF, PR #10 adds the upload step; the nginx Dockerfile ↑ is for dev only. If ECS, add task definition. |
| Observability backend | AWS X-Ray + CloudWatch Logs (cheapest, AWS-native) vs. Datadog vs. self-hosted Jaeger | Update `otel-collector-config.yaml` exporter. |
| Backend repo location | (unknown) | Update `BACKEND_IMAGE` in `.env.example` and `docs/PLATFORM.md` (TBD). |
| Marketing site hosting | (unknown) | If on Cloudflare Pages, OK to leave separate from AWS. |
| `2026FlowOps!` rotation | If it was a real password, it leaked in git history pre-PR #3. | Note status here once rotated. |

## Phase sequencing

### Phase A — Skeleton (this PR, PR #9)

- [x] Fix `frontend/Dockerfile` (npm + lockfile + cache mount + HEALTHCHECK)
- [x] `frontend/.dockerignore`
- [x] Hardened `nginx.conf` template (CSP, HSTS, parameterised upstream)
- [x] `docker-compose.yml`
- [x] `.env.example` at root
- [x] Mark `deploy/*.ps1` deprecated
- [x] This document

### Phase B — CI image build + push (PR #11) ✅

- [x] Picked registry: **GHCR** (`ghcr.io/<owner>/<repo>-frontend`). Authenticates via the workflow's `GITHUB_TOKEN`; no extra IAM. Easy to mirror to ECR later if you'd rather pull from AWS-native — one `docker/login-action` step + a second tag in the metadata-action.
- [x] CI job on push: builds the production image and pushes to GHCR with a versioned tag set (`sha-<short>`, branch name, `latest` on default branch, full semver on `v*` tags).
- [x] CI job builds amd64 first with `load: true`, runs the container, hits `/healthz`, asserts `Strict-Transport-Security` / `Content-Security-Policy` / `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy` are present on `/`, then does the multi-arch (amd64 + arm64) push if the smoke test passed.
- [x] `JWT_SECRET` moved to `${{ secrets.JWT_SECRET }}` (was hardcoded `test-jwt-secret-for-ci`).

Optional repo secrets the new workflow reads (all empty-default; nothing fails if unset):

- `JWT_SECRET` — only used when the `backend` job runs (i.e. when a `backend/` directory exists in the repo).
- `VITE_SENTRY_DSN` — baked into the frontend bundle for error reporting.
- `VITE_OTEL_EXPORTER_OTLP_ENDPOINT` — baked into the frontend bundle for tracing.

How to consume the published image:

```bash
# Latest from main
docker pull ghcr.io/flowopsaas-glitch/flowops-frontend:latest

# A specific commit
docker pull ghcr.io/flowopsaas-glitch/flowops-frontend:sha-<short>

# A release tag
docker pull ghcr.io/flowopsaas-glitch/flowops-frontend:v1.2.3
```

For ECS Fargate / Kubernetes: pull through GHCR is fine, or set up a one-line ECR mirror via [the AWS pull-through cache](https://docs.aws.amazon.com/AmazonECR/latest/userguide/pull-through-cache.html) when you go fully AWS-native.

### Phase C — AWS infrastructure (Terraform; in progress)

Phase C is split across multiple PRs. **PR #12 (this one) is Phase C.1**: scaffolding + bootstrap + frontend-cdn module.

#### C.1 — Scaffolding + bootstrap + frontend CDN ✅ (PR #12)

- [x] Decision: **S3 + CloudFront** for the SPA (cheaper than nginx-in-ECS by ~10× for typical SaaS traffic; edge-cached globally; no autoscaling concerns).
- [x] Decision: **Terraform** (more portable than CDK; readable for ops engineers without Node).
- [x] Decision: **us-east-1** as default region (CloudFront ACM certs must live there anyway).
- [x] `infra/terraform/` directory layout with READMEs at every level.
- [x] `bootstrap/` stack: S3 state bucket (versioned, encrypted, public-access-blocked, 90-day non-current expiry) + DynamoDB lock table (PITR + SSE).
- [x] `modules/frontend-cdn/`: private S3 bucket + CloudFront with OAC, SPA fallback (403/404 → /index.html), security-header response policy matching the nginx config, optional custom domain via Route 53 + ACM.
- [x] `envs/staging/` and `envs/production/` composing the modules with sensible per-env defaults.
- [x] CI: `terraform-validate` job runs `fmt -check` + `init -backend=false` + `validate` on every push and PR.
- [x] Skeletons for `network`, `backend-ecs`, `database`, `cache`, `secrets` so each can be filled in independently.

#### C.2 — Network + backend ECS + ALB (next PR)

- [ ] `modules/network/`: VPC, public/private subnets across 2-3 AZs, IGW + NAT, security groups per service, optional VPC endpoints.
- [ ] `modules/backend-ecs/`: ECS cluster, Fargate task definition, ECS service with autoscaling, ALB + HTTPS listener + target group, CloudWatch logs.
- [ ] Blocked on: backend repo URL (so we know which image tag the task definition consumes).

#### C.3 — Data layer (subsequent PR)

- [ ] `modules/database/`: RDS Postgres 16, subnet group, parameter group, automated backups, Performance Insights, master credential via Secrets Manager.
- [ ] `modules/cache/`: ElastiCache Redis 7, encryption at rest + in transit, auth token via Secrets Manager.
- [ ] `modules/secrets/`: Secrets Manager entries + IAM policy for the ECS task role.

#### C.4 — Cross-cutting (subsequent PR)

- [ ] CloudWatch alarms (RDS CPU, ECS task crashes, ALB 5xx).
- [ ] CI step to `aws s3 sync dist/ ...` after image build (deploy SPA to staging).
- [ ] Tag-based gated production deploy (manual `workflow_dispatch` only).
- [ ] Image scanning (Trivy / Snyk) in `frontend-image` job.
- [ ] Cloudflare R2 wiring for waybill assets (separate from AWS — backend issues presigned URLs).

### Phase D — Cloudflare R2 wiring (PR #12+)

- [ ] Backend: presigned URL endpoints for waybill upload + POD asset reads
- [ ] Frontend: replace `${FLOWOPS_HTTP_ORIGIN}${url}` with the presigned-URL pattern (4 files)
- [ ] Frontend: replace direct multipart upload with two-step (upload-url + commit-upload) flow

### Phase E — Observability + final hardening

- [ ] Production OTel collector config (CORS, exporters, batch sizes)
- [ ] CloudWatch alarms / Datadog monitors on the key paths
- [ ] Tighten CSP from `unsafe-inline` to nonce-based
- [ ] Image scanning in CI (Trivy / Snyk)

## How to run locally with the new compose

```bash
# 1. Copy and fill in .env
cp .env.example .env
$EDITOR .env   # set POSTGRES_PASSWORD, JWT_SECRET, BACKEND_IMAGE

# 2. Build + run the full stack
docker compose up --build

# Or just the frontend pointed at a remote backend (skip api/postgres/redis):
VITE_API_URL=https://api.flowops.example/api docker compose up --build frontend
```

To bring up the observability stack alongside:

```bash
docker compose -f docker-compose.yml -f docker-compose.otel.yml up --build
```

## How to verify the production frontend image

```bash
# Build
docker build \
  --target production \
  --build-arg VITE_API_URL=/api \
  --build-arg VITE_APP_ENV=production \
  --build-arg VITE_APP_VERSION=$(git describe --tags --always) \
  -t flowops/frontend:$(git rev-parse --short HEAD) \
  ./frontend

# Smoke test it
docker run --rm -d \
  --name flowops-frontend-smoke \
  -p 8080:80 \
  -e BACKEND_HOST=host.docker.internal \
  -e BACKEND_PORT=3000 \
  flowops/frontend:$(git rev-parse --short HEAD)

curl -fsS http://localhost:8080/healthz   # → ok
curl -fsS http://localhost:8080/         | head -3   # → <!doctype html>...

docker stop flowops-frontend-smoke
```

## Rollback plan

- Frontend (S3+CF): keep the previous deploy's directory under a date-stamped prefix. Roll back by switching the CloudFront origin path or by re-syncing the previous prefix.
- Backend (ECS): each task definition revision is preserved. Roll back via `aws ecs update-service --task-definition flowops-api:N-1`.
- Database: RDS automated backups + point-in-time recovery. For schema changes, every migration must have a documented rollback path before merge.
- Cloudflare R2: object storage is append-only in this design — uploads are versioned by key, no destructive overwrites. POD audit trail stays intact through any code rollback.
