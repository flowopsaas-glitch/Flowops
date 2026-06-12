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

# ── Secrets ────────────────────────────────────────────────────────────────
# Apply this first (`terraform apply -target=module.secrets`) to create the
# secret container, then populate real values before applying the rest.

module "secrets" {
  source = "../../modules/secrets"

  environment          = "staging"
  recovery_window_days = 7
}

# ── Frontend CDN ──────────────────────────────────────────────────────────

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

  environment                    = "staging"
  single_nat_gateway             = true
  az_count                       = 2
  enable_secretsmanager_endpoint = false
}

# ── Database ──────────────────────────────────────────────────────────────

module "database" {
  source = "../../modules/database"

  environment           = "staging"
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  rds_security_group_id = module.network.rds_security_group_id
  instance_class        = "db.t4g.micro"
  multi_az              = false
  deletion_protection   = false
  skip_final_snapshot   = true
  backup_retention_days = 7

  credentials_secret_recovery_window_days = 7
}

# ── Cache ─────────────────────────────────────────────────────────────────

module "cache" {
  source = "../../modules/cache"

  environment             = "staging"
  private_subnet_ids      = module.network.private_subnet_ids
  redis_security_group_id = module.network.redis_security_group_id
  node_type               = "cache.t4g.micro"
  num_cache_clusters      = 1
}

# ── Backend ECS ───────────────────────────────────────────────────────────

locals {
  # Secret environment variables wired to the Secrets Manager secrets created
  # by the database and secrets modules.  These ARN:KEY:: references are
  # evaluated at ECS task start — the values are never in the task definition
  # or Terraform state in plain text.
  backend_secret_env = {
    DATABASE_URL         = "${module.database.credentials_secret_arn}:DATABASE_URL::"
    JWT_SECRET           = "${module.secrets.secret_arn}:JWT_SECRET::"
    SENDGRID_API_KEY     = "${module.secrets.secret_arn}:SENDGRID_API_KEY::"
    CLOUDFLARE_API_TOKEN = "${module.secrets.secret_arn}:CLOUDFLARE_API_TOKEN::"
  }
}

module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "staging"

  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  backend_image = var.backend_image

  cpu    = 256
  memory = 512

  desired_count = 1
  min_count     = 1
  max_count     = 2

  domain_name         = var.backend_domain_name
  hosted_zone_id      = var.backend_hosted_zone_id
  acm_certificate_arn = var.backend_acm_certificate_arn

  registry_credentials_secret_arn = var.ghcr_credentials_secret_arn

  plain_environment_variables = {
    NODE_ENV  = "staging"
    PORT      = "3000"
    REDIS_URL = module.cache.redis_url
  }

  secret_environment_variables = local.backend_secret_env

  log_retention_days = 7
}
