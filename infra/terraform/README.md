# FlowOps — Terraform infrastructure

> Status: Phase C.3 complete (PR #15). All 6 modules fully implemented.
> All environments wire all modules. Phase D is CI/CD deploy automation.

## Layout

```
infra/terraform/
├── bootstrap/                 Run once per AWS account/region. Provisions
│                              the S3 state bucket + DynamoDB lock table.
│
├── modules/
│   ├── frontend-cdn/          ✓ Complete. S3 + CloudFront for the SPA.
│   ├── network/               ✓ Complete. VPC, subnets, SGs, NAT, VPC endpoints.
│   ├── backend-ecs/           ✓ Complete. ECS Fargate + ALB + Auto Scaling.
│   ├── database/              ✓ Complete. RDS Postgres 16 + credentials secret.
│   ├── cache/                 ✓ Complete. ElastiCache Redis 7.
│   └── secrets/               ✓ Complete. Secrets Manager app secret container.
│
└── envs/
    ├── staging/               Wires all 6 modules with staging defaults.
    └── production/            Same, with stricter defaults.
```

## Prerequisites

1. AWS account + credentials. Default region `us-east-1` (CloudFront ACM
   certs must live there regardless).
2. Terraform >= 1.7 (`brew install terraform` or via `mise`).
3. (Optional) `tflint`, `tfsec`.

## First-time setup (one-time, per AWS account)

The bootstrap stack creates the remote-state backend that every other
stack uses. It uses local state itself — chicken-and-egg.

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
```

Capture the outputs (`state_bucket_name`, `lock_table_name`) and use
them in `envs/<env>/backend.tf`. Defaults match what the env files
already reference (`flowops-tfstate-<account-id>` /
`flowops-terraform-locks`).

## Per-environment workflow

```bash
cd infra/terraform/envs/staging

cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars   # fill in account-specific values

terraform init             # uses the bootstrap S3 backend
terraform plan
terraform apply
```

Same pattern for `envs/production/`.

State files are isolated per env via different S3 keys; an `apply` in
staging can't accidentally touch production resources.

## CI integration

A `terraform-validate` job in `.github/workflows/ci.yml` runs on every
push and PR:

- `terraform fmt -check -recursive infra/terraform`
- `terraform init -backend=false` per env + module
- `terraform validate` per env + module

CI doesn't apply anything — that's manual from a workstation with the
appropriate AWS role assumed.

## Module versioning

Modules are local-path (`source = "../../modules/frontend-cdn"`).
Refactor to a tagged source if any module ever needs to be reused
outside this repo.
