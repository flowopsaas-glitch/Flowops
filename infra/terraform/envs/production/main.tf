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

# Subsequent modules (network / backend-ecs / database / cache / secrets)
# wired in follow-up PRs — same shape as staging.
