provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "FlowOps"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "FlowOps"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

# ── Frontend CDN ─────────────────────────────────────────────────────────

module "frontend_cdn" {
  source = "../../modules/frontend-cdn"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  environment         = "production"
  domain_name         = var.frontend_domain_name
  hosted_zone_id      = var.frontend_hosted_zone_id
  acm_certificate_arn = var.frontend_acm_certificate_arn
  price_class         = var.frontend_price_class
}

# ── Network ───────────────────────────────────────────────────────────────

module "network" {
  source = "../../modules/network"

  environment        = "production"
  vpc_cidr           = var.vpc_cidr
  az_count           = var.az_count
  single_nat_gateway = false # per-AZ NAT for production resilience
  container_port     = var.backend_container_port

  # Recommended for production: VPC endpoints reduce NAT cost and improve
  # startup reliability.
  enable_s3_vpc_endpoint             = true
  enable_secretsmanager_vpc_endpoint = true
}

# ── Backend ECS ───────────────────────────────────────────────────────────

module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "production"

  # Networking
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  # Container image — pin to a versioned tag in production, never `latest`
  backend_image                = var.backend_image
  image_credentials_secret_arn = var.backend_image_credentials_secret_arn
  container_port               = var.backend_container_port

  # Production sizing — override in tfvars if needed
  cpu           = var.backend_cpu
  memory        = var.backend_memory
  desired_count = var.backend_desired_count
  min_count     = 2 # minimum 2 for production HA
  max_count     = 10

  # Autoscaling
  enable_autoscaling     = true
  autoscaling_cpu_target = 65 # slightly more aggressive in production

  # Health check — longer grace period allows DB migrations to complete
  health_check_path                 = "/health"
  health_check_grace_period_seconds = 120

  # Secrets
  secret_arns = var.backend_secret_arns

  # Custom domain — required for production
  domain_name         = var.backend_domain_name
  hosted_zone_id      = var.backend_hosted_zone_id
  acm_certificate_arn = var.backend_acm_certificate_arn
}

# ── Database (Phase C.3 — skeleton) ──────────────────────────────────────
# module "database" {
#   source = "../../modules/database"
#   environment          = "production"
#   vpc_id               = module.network.vpc_id
#   private_subnet_ids   = module.network.private_subnet_ids
#   db_security_group_id = module.network.rds_security_group_id
#   multi_az             = true
#   instance_class       = "db.m5.large"
# }

# ── Cache (Phase C.3 — skeleton) ─────────────────────────────────────────
# module "cache" {
#   source = "../../modules/cache"
#   environment             = "production"
#   vpc_id                  = module.network.vpc_id
#   private_subnet_ids      = module.network.private_subnet_ids
#   cache_security_group_id = module.network.redis_security_group_id
#   num_cache_nodes         = 2
# }

# ── Secrets (Phase C.3 — skeleton) ───────────────────────────────────────
# module "secrets" {
#   source      = "../../modules/secrets"
#   environment = "production"
# }
