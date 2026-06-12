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

# ── Frontend CDN ──────────────────────────────────────────────────────────

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

  environment                    = "production"
  single_nat_gateway             = false # 1 NAT GW per AZ for HA
  az_count                       = 3
  enable_secretsmanager_endpoint = true # reduce NAT traffic on task start
}

# ── Backend ECS ───────────────────────────────────────────────────────────

module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "production"

  # Network inputs from the network module.
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  # Container image.
  backend_image = var.backend_image

  # Fargate sizing for production — size up as load warrants.
  cpu    = 512
  memory = 1024

  # 2 tasks minimum for HA across AZs; scale to 8 under load.
  desired_count = 2
  min_count     = 2
  max_count     = 8

  # Ensure at least 100% of tasks are healthy during a rolling deploy.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Custom API domain (required in production).
  domain_name         = var.backend_domain_name
  hosted_zone_id      = var.backend_hosted_zone_id
  acm_certificate_arn = var.backend_acm_certificate_arn

  # GHCR credentials.
  registry_credentials_secret_arn = var.ghcr_credentials_secret_arn

  # Non-secret env vars.
  plain_environment_variables = {
    NODE_ENV = "production"
    PORT     = "3000"
  }

  # Secret env vars via ECS secrets integration.
  secret_environment_variables = var.backend_secret_environment_variables

  log_retention_days = 90
}

# ── Database (Phase C.3) ──────────────────────────────────────────────────
# module "database" { ... }

# ── Cache (Phase C.3) ─────────────────────────────────────────────────────
# module "cache" { ... }

# ── Secrets (Phase C.3) ───────────────────────────────────────────────────
# module "secrets" { ... }
