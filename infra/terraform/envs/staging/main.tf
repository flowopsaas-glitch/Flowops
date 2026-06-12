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
# the stack's region. Aliased provider so the frontend-cdn module can
# reference us-east-1 resources independently.
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
  single_nat_gateway             = true # 1 NAT GW shared — saves ~$32/month for staging
  az_count                       = 2
  enable_secretsmanager_endpoint = false # NAT traffic is acceptable at staging scale
}

# ── Backend ECS ───────────────────────────────────────────────────────────

module "backend_ecs" {
  source = "../../modules/backend-ecs"

  environment = "staging"

  # Network inputs from the network module.
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  ecs_security_group_id = module.network.ecs_security_group_id

  # Container image: built by CI and pushed to GHCR.
  backend_image = var.backend_image

  # Fargate sizing for staging.
  cpu    = 256
  memory = 512

  # Keep costs down for staging — 1 task minimum, scale to 2.
  desired_count = 1
  min_count     = 1
  max_count     = 2

  # Optional custom domain (comment out to use the ALB hostname).
  domain_name         = var.backend_domain_name
  hosted_zone_id      = var.backend_hosted_zone_id
  acm_certificate_arn = var.backend_acm_certificate_arn

  # GHCR credentials — required to pull the private backend image.
  registry_credentials_secret_arn = var.ghcr_credentials_secret_arn

  # Non-secret env vars injected into every task.
  plain_environment_variables = {
    NODE_ENV = "staging"
    PORT     = "3000"
  }

  # Secret env vars injected via ECS secrets integration.
  # Values must be Secrets Manager ARN or ARN:JsonKey:: references.
  # Wired to the secrets module in a follow-up PR (Phase C.3).
  secret_environment_variables = var.backend_secret_environment_variables

  log_retention_days = 7
}

# ── Database (Phase C.3) ──────────────────────────────────────────────────
# module "database" { ... }

# ── Cache (Phase C.3) ─────────────────────────────────────────────────────
# module "cache" { ... }

# ── Secrets (Phase C.3) ───────────────────────────────────────────────────
# module "secrets" { ... }
