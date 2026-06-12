variable "aws_region" {
  description = "AWS region this env's resources live in. CloudFront / ACM cert resources always also touch us-east-1."
  type        = string
  default     = "us-east-1"
}

# ── Frontend CDN ──────────────────────────────────────────────────────────

variable "frontend_domain_name" {
  description = "Custom domain the SPA is served at (e.g. 'app-staging.flowops.example'). Empty disables custom-domain wiring; the *.cloudfront.net hostname is used."
  type        = string
  default     = ""
}

variable "frontend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for frontend_domain_name. Required if frontend_domain_name is set."
  type        = string
  default     = ""
}

variable "frontend_acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) covering frontend_domain_name. Required if frontend_domain_name is set."
  type        = string
  default     = ""
}

variable "frontend_price_class" {
  description = "CloudFront price class. PriceClass_100 = US/Canada/Europe (cheapest)."
  type        = string
  default     = "PriceClass_100"
}

# ── Backend ECS ───────────────────────────────────────────────────────────

variable "backend_image" {
  description = "Full container image reference for the backend, e.g. ghcr.io/flowopsaas-glitch/flowops-backend:sha-abc1234."
  type        = string
  default     = "ghcr.io/flowopsaas-glitch/flowops-backend:latest"
}

variable "backend_domain_name" {
  description = "Custom domain for the API, e.g. 'api-staging.flowops.example'. Empty = use ALB hostname."
  type        = string
  default     = ""
}

variable "backend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for backend_domain_name. Required if backend_domain_name is set."
  type        = string
  default     = ""
}

variable "backend_acm_certificate_arn" {
  description = "ACM certificate ARN in the deployment region covering backend_domain_name."
  type        = string
  default     = ""
}

variable "ghcr_credentials_secret_arn" {
  description = "ARN of a Secrets Manager secret containing GHCR pull credentials ({\"username\": \"...\", \"password\": \"...\"})."
  type        = string
  default     = ""
}
