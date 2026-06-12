data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # Auto-compute CIDR blocks unless the caller provides explicit overrides.
  # Public:  10.0.0.0/24, 10.0.1.0/24, ...
  # Private: 10.0.100.0/24, 10.0.101.0/24, ...
  public_subnet_cidrs = (
    length(var.public_subnet_cidrs) == var.az_count
    ? var.public_subnet_cidrs
    : [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i)]
  )
  private_subnet_cidrs = (
    length(var.private_subnet_cidrs) == var.az_count
    ? var.private_subnet_cidrs
    : [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 100)]
  )

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "network"
    },
    var.tags,
  )
}

# ── VPC ───────────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}"
  })
}

# ── Public subnets (ALB, NAT GW elastic IPs) ─────────────────────────────

resource "aws_subnet" "public" {
  count = var.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false # ALB nodes get IPs via ENI, not subnet default

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-public-${local.azs[count.index]}"
    Tier = "public"
  })
}

# ── Private subnets (ECS tasks, RDS, Redis) ───────────────────────────────

resource "aws_subnet" "private" {
  count = var.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-private-${local.azs[count.index]}"
    Tier = "private"
  })
}

# ── Internet Gateway ──────────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-igw"
  })
}

# ── Elastic IPs for NAT Gateway(s) ───────────────────────────────────────

resource "aws_eip" "nat" {
  # single_nat_gateway = true → 1 EIP; false → 1 per AZ
  count  = var.single_nat_gateway ? 1 : var.az_count
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.main]
}

# ── NAT Gateway(s) ────────────────────────────────────────────────────────

resource "aws_nat_gateway" "main" {
  count = var.single_nat_gateway ? 1 : var.az_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.main]
}

# ── Route tables ──────────────────────────────────────────────────────────

# Public: route to IGW.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private: one route table per NAT GW (or one shared).
resource "aws_route_table" "private" {
  count  = var.single_nat_gateway ? 1 : var.az_count
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[var.single_nat_gateway ? 0 : count.index].id
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-private-rt-${count.index}"
  })
}

resource "aws_route_table_association" "private" {
  count          = var.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[var.single_nat_gateway ? 0 : count.index].id
}

# ── Security groups ───────────────────────────────────────────────────────

# ALB: internet-facing, accepts 80 + 443.
resource "aws_security_group" "alb" {
  name        = "flowops-${var.environment}-alb"
  description = "ALB — inbound HTTP/HTTPS from internet; outbound to ECS tasks only."
  vpc_id      = aws_vpc.main.id

  ingress {
    description      = "HTTPS from internet"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTP from internet (redirect to HTTPS)"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    description = "All outbound (restricted to ECS SG by the ECS inbound rule)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-alb-sg"
  })
}

# ECS tasks: only accept traffic from the ALB SG on the container port.
resource "aws_security_group" "ecs" {
  name        = "flowops-${var.environment}-ecs"
  description = "ECS tasks — inbound on container port from ALB only; outbound to internet (for secrets, npm, etc.)."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "From ALB on container port"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-ecs-sg"
  })
}

# RDS: only accept Postgres from ECS tasks.
resource "aws_security_group" "rds" {
  name        = "flowops-${var.environment}-rds"
  description = "RDS Postgres — inbound 5432 from ECS tasks only."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-rds-sg"
  })
}

# Redis: only accept from ECS tasks.
resource "aws_security_group" "redis" {
  name        = "flowops-${var.environment}-redis"
  description = "ElastiCache Redis — inbound 6379 from ECS tasks only."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-redis-sg"
  })
}

# ── Optional VPC endpoints ────────────────────────────────────────────────

# Gateway endpoint for S3 — free, avoids NAT for S3 egress.
resource "aws_vpc_endpoint" "s3" {
  count = var.enable_s3_vpc_endpoint ? 1 : 0

  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"

  route_table_ids = concat(
    [aws_route_table.public.id],
    aws_route_table.private[*].id,
  )

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-s3-endpoint"
  })
}

# Interface endpoint security group — needed for Secrets Manager Interface endpoint.
resource "aws_security_group" "vpc_endpoints" {
  count = var.enable_secretsmanager_vpc_endpoint ? 1 : 0

  name        = "flowops-${var.environment}-vpc-endpoints"
  description = "Interface VPC endpoints — allow HTTPS from within the VPC."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-vpc-endpoints-sg"
  })
}

# Interface endpoint for Secrets Manager — avoids NAT at task startup.
resource "aws_vpc_endpoint" "secretsmanager" {
  count = var.enable_secretsmanager_vpc_endpoint ? 1 : 0

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "flowops-${var.environment}-secretsmanager-endpoint"
  })
}
