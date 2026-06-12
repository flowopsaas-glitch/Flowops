# Staging environment

Composes the modules into a deployable stack for staging.

## First-time setup

1. Run `bootstrap/` first (one-time per AWS account) so the remote state backend exists. See `infra/terraform/bootstrap/README.md`.
2. Copy the example tfvars and fill in your values:

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   $EDITOR terraform.tfvars
   ```

3. Initialise + plan + apply:

   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

## What this env provisions today

- **Frontend CDN** — S3 + CloudFront for the SPA. See `../../modules/frontend-cdn/README.md` for the deploy commands you'll run from CI.

## What this env will provision (subsequent PRs)

- VPC + subnets + security groups (network module)
- ECS Fargate + ALB for the backend (backend-ecs module)
- RDS Postgres (database module)
- ElastiCache Redis (cache module)
- Secrets Manager entries (secrets module)

Each module call is currently commented out in `main.tf` with a TODO.

## State

Remote state in S3, locked via DynamoDB. See `backend.tf`.

## Outputs

- `frontend_url` — public URL of the SPA.
- `frontend_bucket_name` — bucket to `aws s3 sync dist/ ...` to.
- `frontend_distribution_id` — CloudFront ID for cache invalidation.
