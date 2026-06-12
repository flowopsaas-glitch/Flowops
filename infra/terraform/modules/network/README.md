# `modules/network` — VPC + subnets + security groups

Status: **complete** (Phase C.2).

## What this module provisions

| Resource | Details |
|---|---|
| VPC | Configurable CIDR (default `10.0.0.0/16`), DNS support + hostnames enabled |
| Public subnets | `/24` per AZ starting at `.0` — ALB and NAT GW EIPs live here |
| Private subnets | `/24` per AZ starting at `.10` — ECS tasks, RDS, Redis live here |
| Internet Gateway | One per VPC |
| NAT Gateways | `single_nat_gateway=true` (1 shared, good for staging); `false` = 1 per AZ (HA, good for production) |
| Route tables | 1 public + 1 (or N) private, with associations |
| Security groups | ALB, ECS, RDS, Redis — rules as separate resources to avoid circular dependencies |
| S3 VPC endpoint | Gateway type, free, reduces NAT traffic |
| Secrets Manager endpoint | Interface type, optional, ~$0.01/hr/AZ — recommended for production |

## Security group design

Rules are declared as separate `aws_security_group_rule` resources (not inline) to break the
circular reference between ALB SG ↔ ECS SG.

```
Internet ──443/80──> ALB SG ──3000──> ECS SG ──5432──> RDS SG
                                            └──6379──> Redis SG
                                            └──443───> 0.0.0.0/0 (AWS APIs, Cloudflare R2, etc.)
```

## Key outputs

| Output | Used by |
|---|---|
| `vpc_id` | database, cache, secrets, backend-ecs |
| `public_subnet_ids` | backend-ecs (ALB) |
| `private_subnet_ids` | backend-ecs (tasks), database, cache |
| `alb_security_group_id` | backend-ecs |
| `ecs_security_group_id` | backend-ecs |
| `rds_security_group_id` | database |
| `redis_security_group_id` | cache |
| `nat_gateway_public_ips` | whitelist in SendGrid, Cloudflare |

## Staging vs production recommendations

| Variable | Staging | Production |
|---|---|---|
| `single_nat_gateway` | `true` (saves ~$32/month) | `false` (HA) |
| `enable_secretsmanager_endpoint` | `false` (NAT is fine at low scale) | `true` (saves NAT traffic on every task start) |
| `az_count` | `2` | `3` |
