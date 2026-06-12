provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "FlowOps"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront ACM certs MUST live in us-east-1 regardless of the rest of
# the stack's region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "FlowOps"
      Environment = "staging"
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

  environment         = "staging"
  domain_name         = var.frontend_domain_name
  hosted_zone_id      = var.frontend_hosted_zone_id
  acm_certificate_arn = var.frontend_acm_certificate_arn
  price_class         = var.frontend_price_class
}

# ── Network ───────────────────────────────────────────────────────────────

module "network" {
  source = "../../modules/network"

  environment        = "staging"
  vpc_cidr           = var.vpc_cidr
  az_count           = var.az_count
  single_nat_gateway = true # one NAT is fine for staging
  container_port     = var.backend_container_port
}

# ── Backend ECS ───────────────────────────────────────────────────────────

module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "staging"

  # Networking — from the network module above
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  # Container image
  backend_image                = var.backend_image
  image_credentials_secret_arn = var.backend_image_credentials_secret_arn
  container_port               = var.backend_container_port

  # Sizing — keep it small in staging
  cpu           = var.backend_cpu
  memory        = var.backend_memory
  desired_count = var.backend_desired_count
  min_count     = 1
  max_count     = 3

  # Autoscaling on CPU
  enable_autoscaling     = true
  autoscaling_cpu_target = 70

  # Health check
  health_check_path                 = "/health"
  health_check_grace_period_seconds = 60

  # Secrets — provide ARNs after the secrets module is wired in (Phase C.3)
  # Until then, the backend must start without these injected env vars.
  secret_arns = var.backend_secret_arns

  # Optional custom API domain
  domain_name         = var.backend_domain_name
  hosted_zone_id      = var.backend_hosted_zone_id
  acm_certificate_arn = var.backend_acm_certificate_arn
}

# ── Database (Phase C.3 — skeleton) ─────────────────────────────────────
# module "database" {
#   source = "../../modules/database"
#   environment          = "staging"
#   vpc_id               = module.network.vpc_id
#   private_subnet_ids   = module.network.private_subnet_ids
#   db_security_group_id = module.network.rds_security_group_id
# }

# ── Cache (Phase C.3 — skeleton) ─────────────────────────────────────────
# module "cache" {
#   source = "../../modules/cache"
#   environment               = "staging"
#   vpc_id                    = module.network.vpc_id
#   private_subnet_ids        = module.network.private_subnet_ids
#   cache_security_group_id   = module.network.redis_security_group_id
# }

# ── Secrets (Phase C.3 — skeleton) ───────────────────────────────────────
# module "secrets" {
#   source      = "../../modules/secrets"
#   environment = "staging"
# }
