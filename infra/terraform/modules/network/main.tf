data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Use the first N AZs sorted alphabetically (deterministic, avoids
  # depending on the data source's implicit ordering).
  az_names = slice(
    sort(data.aws_availability_zones.available.names),
    0,
    min(var.az_count, length(data.aws_availability_zones.available.names)),
  )
  az_count = length(local.az_names)

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      Component   = "network"
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# ── VPC ──────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge({ Name = "flowops-${var.environment}" }, local.common_tags)
}

# ── Internet Gateway ─────────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge({ Name = "flowops-${var.environment}-igw" }, local.common_tags)
}

# ── Subnets ───────────────────────────────────────────────────────────────
# Public:  10.0.{0..2}.0/24  - ALB, NAT GW EIPs live here.
# Private: 10.0.{10..12}.0/24 - ECS tasks, RDS, Redis live here.

resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.az_names[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    {
      Name = "flowops-${var.environment}-public-${local.az_names[count.index]}"
      Tier = "public"
    },
    local.common_tags,
  )
}

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.az_names[count.index]

  tags = merge(
    {
      Name = "flowops-${var.environment}-private-${local.az_names[count.index]}"
      Tier = "private"
    },
    local.common_tags,
  )
}

# ── NAT Gateways ─────────────────────────────────────────────────────────
# single_nat_gateway=true (staging): 1 EIP + 1 NAT in az[0], all private
# route tables point to it.
# single_nat_gateway=false (production): 1 EIP + 1 NAT per AZ, each private
# route table points to its own NAT.

resource "aws_eip" "nat" {
  count  = var.single_nat_gateway ? 1 : local.az_count
  domain = "vpc"

  tags = merge(
    { Name = "flowops-${var.environment}-nat-eip-${count.index}" },
    local.common_tags,
  )

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count = var.single_nat_gateway ? 1 : local.az_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    { Name = "flowops-${var.environment}-nat-${count.index}" },
    local.common_tags,
  )

  depends_on = [aws_internet_gateway.main]
}

# ── Route tables ─────────────────────────────────────────────────────────

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge({ Name = "flowops-${var.environment}-public" }, local.common_tags)
}

resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# One private route table per NAT gateway.
resource "aws_route_table" "private" {
  count  = var.single_nat_gateway ? 1 : local.az_count
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[var.single_nat_gateway ? 0 : count.index].id
  }

  tags = merge(
    { Name = "flowops-${var.environment}-private-${count.index}" },
    local.common_tags,
  )
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[var.single_nat_gateway ? 0 : count.index].id
}

# ── Security Groups ───────────────────────────────────────────────────────
# All SGs are created blank (no inline rules) to avoid the circular
# dependency that arises when ALB SG egresses to ECS SG and ECS SG ingresses
# from ALB SG. Rules are added as separate aws_security_group_rule resources.

resource "aws_security_group" "alb" {
  name        = "flowops-${var.environment}-alb"
  description = "FlowOps ${var.environment} ALB - public HTTP/HTTPS ingress"
  vpc_id      = aws_vpc.main.id

  tags = merge({ Name = "flowops-${var.environment}-alb" }, local.common_tags)

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "ecs" {
  name        = "flowops-${var.environment}-ecs"
  description = "FlowOps ${var.environment} ECS tasks - inbound from ALB SG only"
  vpc_id      = aws_vpc.main.id

  tags = merge({ Name = "flowops-${var.environment}-ecs" }, local.common_tags)

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "rds" {
  name        = "flowops-${var.environment}-rds"
  description = "FlowOps ${var.environment} RDS - inbound Postgres from ECS SG only"
  vpc_id      = aws_vpc.main.id

  tags = merge({ Name = "flowops-${var.environment}-rds" }, local.common_tags)

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "redis" {
  name        = "flowops-${var.environment}-redis"
  description = "FlowOps ${var.environment} Redis - inbound from ECS SG only"
  vpc_id      = aws_vpc.main.id

  tags = merge({ Name = "flowops-${var.environment}-redis" }, local.common_tags)

  lifecycle {
    create_before_destroy = true
  }
}

# ── ALB rules ─────────────────────────────────────────────────────────────

resource "aws_security_group_rule" "alb_ingress_http" {
  security_group_id = aws_security_group.alb.id
  type              = "ingress"
  description       = "HTTP from anywhere (redirected to HTTPS)"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_ingress_https" {
  security_group_id = aws_security_group.alb.id
  type              = "ingress"
  description       = "HTTPS from anywhere"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_egress_ecs" {
  security_group_id        = aws_security_group.alb.id
  type                     = "egress"
  description              = "Forward traffic to backend ECS tasks"
  from_port                = var.backend_container_port
  to_port                  = var.backend_container_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
}

# ── ECS task rules ────────────────────────────────────────────────────────

resource "aws_security_group_rule" "ecs_ingress_alb" {
  security_group_id        = aws_security_group.ecs.id
  type                     = "ingress"
  description              = "Backend port from ALB"
  from_port                = var.backend_container_port
  to_port                  = var.backend_container_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "ecs_egress_rds" {
  security_group_id        = aws_security_group.ecs.id
  type                     = "egress"
  description              = "Postgres to RDS"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group_rule" "ecs_egress_redis" {
  security_group_id        = aws_security_group.ecs.id
  type                     = "egress"
  description              = "Redis to ElastiCache"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.redis.id
}

resource "aws_security_group_rule" "ecs_egress_https" {
  security_group_id = aws_security_group.ecs.id
  type              = "egress"
  description       = "HTTPS to internet - AWS APIs, Cloudflare R2, external services"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

# ── RDS rules ─────────────────────────────────────────────────────────────

resource "aws_security_group_rule" "rds_ingress_ecs" {
  security_group_id        = aws_security_group.rds.id
  type                     = "ingress"
  description              = "Postgres from ECS tasks"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
}

# ── Redis rules ───────────────────────────────────────────────────────────

resource "aws_security_group_rule" "redis_ingress_ecs" {
  security_group_id        = aws_security_group.redis.id
  type                     = "ingress"
  description              = "Redis from ECS tasks"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
}

# ── VPC Endpoints ─────────────────────────────────────────────────────────

# S3 Gateway endpoint - free, reduces NAT traffic for S3 calls.
resource "aws_vpc_endpoint" "s3" {
  count = var.enable_s3_endpoint ? 1 : 0

  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id,
  )

  tags = merge({ Name = "flowops-${var.environment}-s3-ep" }, local.common_tags)
}

# Secrets Manager Interface endpoint - $0.01/hr per AZ, eliminates NAT
# traffic on task start when ECS pulls secrets. Worth it in production.
resource "aws_vpc_endpoint" "secretsmanager" {
  count = var.enable_secretsmanager_endpoint ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.ecs.id]
  private_dns_enabled = true

  tags = merge({ Name = "flowops-${var.environment}-sm-ep" }, local.common_tags)
}
