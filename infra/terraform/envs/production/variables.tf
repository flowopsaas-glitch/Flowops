variable "aws_region" {
  description = "AWS region this env's resources live in."
  type        = string
  default     = "us-east-1"
}

# ── Frontend CDN ──────────────────────────────────────────────────────────

variable "frontend_domain_name" {
  description = "Custom domain the SPA is served at. Production should NOT run on the default cloudfront.net hostname."
  type        = string
  validation {
    condition     = length(var.frontend_domain_name) > 0
    error_message = "frontend_domain_name is required in production. Set it in terraform.tfvars."
  }
}

variable "frontend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for frontend_domain_name."
  type        = string
  validation {
    condition     = length(var.frontend_hosted_zone_id) > 0
    error_message = "frontend_hosted_zone_id is required in production."
  }
}

variable "frontend_acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) covering frontend_domain_name."
  type        = string
  validation {
    condition     = length(var.frontend_acm_certificate_arn) > 0
    error_message = "frontend_acm_certificate_arn is required in production."
  }
}

variable "frontend_price_class" {
  description = "CloudFront price class. PriceClass_All recommended for production (global edge)."
  type        = string
  default     = "PriceClass_All"
}

# ── Backend ECS ───────────────────────────────────────────────────────────

variable "backend_image" {
  description = "Full container image reference for the backend. Tag a specific sha in production — never 'latest'."
  type        = string
  validation {
    condition     = length(var.backend_image) > 0
    error_message = "backend_image is required in production. Pin to a specific sha tag."
  }
}

variable "backend_domain_name" {
  description = "Custom domain for the API, e.g. 'api.flowops.example'. Required in production."
  type        = string
  validation {
    condition     = length(var.backend_domain_name) > 0
    error_message = "backend_domain_name is required in production."
  }
}

variable "backend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for backend_domain_name."
  type        = string
  validation {
    condition     = length(var.backend_hosted_zone_id) > 0
    error_message = "backend_hosted_zone_id is required in production."
  }
}

variable "backend_acm_certificate_arn" {
  description = "ACM certificate ARN in the deployment region covering backend_domain_name."
  type        = string
  validation {
    condition     = length(var.backend_acm_certificate_arn) > 0
    error_message = "backend_acm_certificate_arn is required in production."
  }
}

variable "ghcr_credentials_secret_arn" {
  description = "ARN of a Secrets Manager secret containing GHCR pull credentials ({\"username\": \"...\", \"password\": \"...\"})."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "RDS instance class. db.t4g.small is cost-effective for moderate production load; db.r8g.large for read-heavy workloads."
  type        = string
  default     = "db.t4g.small"
}

variable "redis_node_type" {
  description = "ElastiCache node type. cache.t4g.small for moderate load; cache.r7g.large for session-heavy workloads."
  type        = string
  default     = "cache.t4g.small"
}
