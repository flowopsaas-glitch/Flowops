# `modules/backend-ecs` — ECS Fargate service + ALB

Provisions the backend application service.

## What it creates

| Resource | Notes |
|---|---|
| ECS cluster | Container Insights enabled |
| IAM task execution role | AmazonECSTaskExecutionRolePolicy + scoped Secrets Manager GetSecretValue for the provided secret ARNs |
| IAM task role | Starts empty — attach extra policies in the calling env |
| ECS task definition | Fargate, `awsvpc`, Container Insights; `lifecycle.ignore_changes` on `task_definition` so the CD pipeline can roll new images independently of Terraform |
| Application Load Balancer | Internet-facing, uses `public_subnet_ids` |
| ALB target group | IP targets (required for Fargate `awsvpc`) |
| HTTPS listener on 443 | Created when `acm_certificate_arn` is set; uses TLS 1.3 policy |
| HTTP → HTTPS redirect | Created alongside the HTTPS listener |
| Plain HTTP listener on 80 | Created when no ACM cert is provided (e.g. staging without a custom domain) |
| ECS service | Fargate; `lifecycle.ignore_changes` on `desired_count` + `task_definition` so Terraform doesn't fight the autoscaler |
| Auto-scaling | Target-tracking on CPU (default 70%) when `enable_autoscaling = true` |
| CloudWatch Log Group | `/ecs/flowops/<environment>/backend`; configurable retention |
| Route 53 A record | Created when `domain_name` is set |

## Usage

```hcl
module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "staging"

  # From the network module
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  # Container image (from GHCR — set up by PR #11)
  backend_image                = "ghcr.io/flowopsaas-glitch/flowops-backend:latest"
  image_credentials_secret_arn = var.backend_image_credentials_secret_arn  # optional if public

  # Secrets (populate via AWS Console / CLI after first apply)
  secret_arns = {
    DATABASE_URL = aws_secretsmanager_secret.database_url.arn
    REDIS_URL    = aws_secretsmanager_secret.redis_url.arn
    JWT_SECRET   = aws_secretsmanager_secret.jwt_secret.arn
  }

  # Optional custom API domain
  domain_name         = "api-staging.flowops.example"
  hosted_zone_id      = var.hosted_zone_id
  acm_certificate_arn = var.api_acm_certificate_arn  # in the service's region, not us-east-1
}
```

## Deploying new backend versions (without `terraform apply`)

The ECS service ignores `task_definition` changes in its `lifecycle` block. The standard CD pattern is:

```bash
# After pushing a new image to GHCR:
aws ecs update-service \
  --cluster "flowops-${ENV}" \
  --service "flowops-${ENV}-backend" \
  --force-new-deployment \
  --region us-east-1
```

Or use the ECS rolling deployment triggered by updating the task definition via the AWS CLI:

```bash
IMAGE_TAG="v1.2.3"
aws ecs register-task-definition \
  --cli-input-json "$(aws ecs describe-task-definition \
    --task-definition "flowops-${ENV}-backend" \
    --query 'taskDefinition' \
    | jq '.containerDefinitions[0].image = "ghcr.io/flowopsaas-glitch/flowops-backend:'"${IMAGE_TAG}"'"')"
```

## Secrets pattern

Secrets are injected as plaintext environment variables at container start via `ECS_TASK_DEFINITION.secrets`. The execution role is automatically granted `secretsmanager:GetSecretValue` for exactly the ARNs you pass in.

**Create and populate a secret after the first `terraform apply`:**

```bash
# Create the slot (Terraform does this)
# Populate the value (you do this — never in Terraform state)
aws secretsmanager put-secret-value \
  --secret-id "arn:aws:secretsmanager:..." \
  --secret-string "postgres://user:pass@host:5432/flowops"
```

Force-cycle the tasks after updating secrets so they pick up the new values:

```bash
aws ecs update-service \
  --cluster "flowops-${ENV}" \
  --service "flowops-${ENV}-backend" \
  --force-new-deployment
```

## ALB security notes

- `enable_deletion_protection = true` on the ALB in production (prevents accidental `terraform destroy` taking down the whole service).
- HTTPS listener uses `ELBSecurityPolicy-TLS13-1-2-2021-06` (TLS 1.3 + 1.2 only; TLS 1.1 and below disabled).
- HTTP in staging (no ACM cert): acceptable for internal testing. Set `acm_certificate_arn` before going to production.

## Fargate CPU / Memory compatibility

Valid combinations (from AWS docs):

| CPU | Memory (MiB) |
|---|---|
| 256 | 512, 1024, 2048 |
| 512 | 1024–4096 (in 1024 steps) |
| 1024 | 2048–8192 (in 1024 steps) |
| 2048 | 4096–16384 (in 1024 steps) |
| 4096 | 8192–30720 (in 1024 steps) |

Default: 512 CPU / 1024 MiB (roughly equivalent to a t3.small).
