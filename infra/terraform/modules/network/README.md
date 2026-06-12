# `modules/network` — VPC + subnets + security groups (skeleton)

Status: **placeholder**, filled in by a subsequent PR.

Will provision:

- VPC with public + private subnets across 2-3 AZs.
- Internet Gateway + NAT Gateway (single NAT for staging, per-AZ for production).
- Route tables.
- Default security groups for: ALB (public ingress), ECS service (private), RDS (private), Redis (private).
- VPC endpoints for S3 + Secrets Manager (optional, reduces NAT traffic cost).

Will export:

- `vpc_id`
- `public_subnet_ids` (list)
- `private_subnet_ids` (list)
- Per-purpose security group IDs.
