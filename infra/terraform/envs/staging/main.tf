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

# ── Network (TODO: filled in by a follow-up PR) ─────────────────────────
# module "network" {
#   source      = "../../modules/network"
#   environment = "staging"
# }

# ── Backend ECS service (TODO) ──────────────────────────────────────────
# module "backend_ecs" {
#   source      = "../../modules/backend-ecs"
#   environment = "staging"
#   vpc_id      = module.network.vpc_id
# }

# ── Database (TODO) ─────────────────────────────────────────────────────
# module "database" {
#   source      = "../../modules/database"
#   environment = "staging"
#   vpc_id      = module.network.vpc_id
# }

# ── Cache (TODO) ────────────────────────────────────────────────────────
# module "cache" {
#   source      = "../../modules/cache"
#   environment = "staging"
#   vpc_id      = module.network.vpc_id
# }

# ── Secrets (TODO) ──────────────────────────────────────────────────────
# module "secrets" {
#   source      = "../../modules/secrets"
#   environment = "staging"
# }
