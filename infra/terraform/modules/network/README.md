# `modules/network` — VPC + subnets + security groups

Provisions the shared networking layer every other FlowOps module depends on.

## What it creates

| Resource | Count | Notes |
|---|---|---|
| VPC | 1 | DNS support + hostnames enabled |
| Public subnets | `az_count` (2–3) | For the ALB. CIDRs auto-computed from `vpc_cidr` unless overridden. |
| Private subnets | `az_count` (2–3) | For ECS tasks, RDS, Redis. No public IPs. |
| Internet Gateway | 1 | Public internet access for the ALB |
| Elastic IPs | 1 or `az_count` | One per NAT Gateway |
| NAT Gateway | 1 (staging) or `az_count` (production) | Outbound internet for private subnets |
| Route tables | 1 public + 1 or `az_count` private | Public → IGW; private → NAT |
| Security group: ALB | 1 | Ingress 80+443 from `0.0.0.0/0`; egress unrestricted |
| Security group: ECS | 1 | Ingress `container_port` from ALB SG only; egress unrestricted |
| Security group: RDS | 1 | Ingress 5432 from ECS SG only |
| Security group: Redis | 1 | Ingress 6379 from ECS SG only |
| Gateway VPC endpoint: S3 | 0 or 1 | Free. Reduces NAT cost for S3 traffic. |
| Interface VPC endpoint: Secrets Manager | 0 or 1 | ~$7/month. Speeds up task startup by avoiding NAT. |

## Usage

```hcl
module "network" {
  source = "../../modules/network"

  environment        = "staging"
  single_nat_gateway = true   # false for production (per-AZ resilience)
  az_count           = 2
  container_port     = 3000
}
```

Pass the outputs to downstream modules:

```hcl
module "backend_ecs" {
  source = "../../modules/backend-ecs"

  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id
}

module "database" {
  source = "../../modules/database"

  vpc_id                 = module.network.vpc_id
  private_subnet_ids     = module.network.private_subnet_ids
  db_security_group_id   = module.network.rds_security_group_id
}

module "cache" {
  source = "../../modules/cache"

  vpc_id                    = module.network.vpc_id
  private_subnet_ids        = module.network.private_subnet_ids
  cache_security_group_id   = module.network.redis_security_group_id
}
```

## Staging vs production defaults

| Setting | Staging | Production |
|---|---|---|
| `single_nat_gateway` | `true` | `false` |
| `az_count` | `2` | `3` |
| `enable_s3_vpc_endpoint` | `false` | `true` (recommended) |
| `enable_secretsmanager_vpc_endpoint` | `false` | `true` (recommended) |

## CIDR layout (defaults for `10.0.0.0/16`)

| Subnet | CIDR | Purpose |
|---|---|---|
| public-us-east-1a | `10.0.0.0/24` | ALB node, NAT EIP |
| public-us-east-1b | `10.0.1.0/24` | ALB node |
| public-us-east-1c | `10.0.2.0/24` | ALB node (when az_count = 3) |
| private-us-east-1a | `10.0.100.0/24` | ECS, RDS, Redis |
| private-us-east-1b | `10.0.101.0/24` | ECS, RDS, Redis |
| private-us-east-1c | `10.0.102.0/24` | ECS, RDS, Redis (when az_count = 3) |

Override via `public_subnet_cidrs` / `private_subnet_cidrs` if you need different allocation.
