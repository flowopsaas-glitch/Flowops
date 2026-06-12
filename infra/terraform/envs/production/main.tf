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

# ── Secrets ────────────────────────────────────────────────────────────────

module "secrets" {
  source = "../../modules/secrets"

  environment          = "production"
  recovery_window_days = 30
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
  single_nat_gateway             = false
  az_count                       = 3
  enable_secretsmanager_endpoint = true
}

# ── Database ──────────────────────────────────────────────────────────────

module "database" {
  source = "../../modules/database"

  environment           = "production"
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  rds_security_group_id = module.network.rds_security_group_id
  instance_class        = var.db_instance_class
  multi_az              = true
  deletion_protection   = true
  skip_final_snapshot   = false
  backup_retention_days = 14

  credentials_secret_recovery_window_days = 30
}

# ── Cache ─────────────────────────────────────────────────────────────────

module "cache" {
  source = "../../modules/cache"

  environment                = "production"
  private_subnet_ids         = module.network.private_subnet_ids
  redis_security_group_id    = module.network.redis_security_group_id
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  multi_az_enabled           = true
  automatic_failover_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = 7
}

# ── Backend ECS ───────────────────────────────────────────────────────────

locals {
  backend_secret_env = {
    DATABASE_URL         = "${module.database.credentials_secret_arn}:DATABASE_URL::"
    JWT_SECRET           = "${module.secrets.secret_arn}:JWT_SECRET::"
    SENDGRID_API_KEY     = "${module.secrets.secret_arn}:SENDGRID_API_KEY::"
    CLOUDFLARE_API_TOKEN = "${module.secrets.secret_arn}:CLOUDFLARE_API_TOKEN::"
  }
}

module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "production"

  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  backend_image = var.backend_image

  cpu    = 512
  memory = 1024

  desired_count = 2
  min_count     = 2
  max_count     = 8

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  domain_name         = var.backend_domain_name
  hosted_zone_id      = var.backend_hosted_zone_id
  acm_certificate_arn = var.backend_acm_certificate_arn

  registry_credentials_secret_arn = var.ghcr_credentials_secret_arn

  plain_environment_variables = {
    NODE_ENV  = "production"
    PORT      = "3000"
    REDIS_URL = module.cache.redis_url
  }

  secret_environment_variables = local.backend_secret_env

  log_retention_days = 90
}
