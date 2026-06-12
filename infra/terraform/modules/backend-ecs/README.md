# `modules/backend-ecs` — ECS Fargate service + ALB

Status: **complete** (Phase C.2).

## What this module provisions

| Resource | Details |
|---|---|
| ECS Cluster | Fargate-only, Container Insights enabled |
| ECS Task Definition | Fargate, configurable CPU/memory, env from Secrets Manager |
| ECS Service | Rolling deploy with circuit-breaker + auto-rollback |
| Application Load Balancer | Public-facing, attached to ALB security group |
| ALB Target Group | IP-mode (awsvpc), `/health` health check |
| HTTP Listener | Redirects to HTTPS when `acm_certificate_arn` is set; forwards directly otherwise |
| HTTPS Listener | Created only when `acm_certificate_arn` is provided |
| Route 53 A + AAAA | Created only when `domain_name` is set |
| Auto Scaling | Target-tracking on CPU (`cpu_scale_out_threshold`%, default 70%); `min_count`–`max_count` tasks |
| CloudWatch Log Group | Configurable retention; structured logs land here |
| IAM Execution Role | `AmazonECSTaskExecutionRolePolicy` + `secretsmanager:GetSecretValue` for all referenced secrets |
| IAM Task Role | `AWSXRayDaemonWriteAccess` + CloudWatch Logs write; extend with `aws_iam_role_policy_attachment` |

## Secrets injection pattern

Environment variables come in two flavours:

```hcl
module "backend_ecs" {
  # ...
  plain_environment_variables = {
    NODE_ENV   = "production"
    PORT       = "3000"
  }
  secret_environment_variables = {
    # Value = Secrets Manager ARN (whole secret) or ARN:JsonKey:: (single key)
    DATABASE_URL = "${module.secrets.secret_arn}:DATABASE_URL::"
    JWT_SECRET   = "${module.secrets.secret_arn}:JWT_SECRET::"
  }
}
```

The execution role is automatically granted `GetSecretValue` on every distinct ARN that appears in `secret_environment_variables`.

## Pulling from GHCR (private registry)

```hcl
module "backend_ecs" {
  # ...
  registry_credentials_secret_arn = aws_secretsmanager_secret.ghcr.arn
  # Secret value: {"username": "<github-user>", "password": "<PAT with read:packages>"}
}
```

The execution role is granted `GetSecretValue` on this ARN automatically.

## CI/CD deploy pattern

After this module is applied, the standard CD step is:

```bash
# 1. Register a new task definition revision with the new image tag.
aws ecs register-task-definition \
  --family flowops-production-backend \
  --cli-input-json file://task-def.json

# 2. Update the service to the new revision.
aws ecs update-service \
  --cluster flowops-production \
  --service flowops-production-backend \
  --task-definition flowops-production-backend:<new-revision>
```

The circuit breaker rolls back automatically if tasks don't reach RUNNING within the health check window.

## Staging vs production differences

| Variable | Staging | Production |
|---|---|---|
| `cpu` | 256–512 | 512–1024+ |
| `min_count` | 1 | 2 (for HA) |
| `max_count` | 2 | 8 |
| `single_nat_gateway` (network) | `true` | `false` |
| `deployment_minimum_healthy_percent` | 50 | 100 |
| `log_retention_days` | 7 | 90 |
