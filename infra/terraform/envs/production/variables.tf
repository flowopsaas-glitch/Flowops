# ── Region ────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region this env's resources live in."
  type        = string
  default     = "us-east-1"
}

# ── Frontend CDN ──────────────────────────────────────────────────────────
# All three frontend domain variables are REQUIRED for production.

variable "frontend_domain_name" {
  description = "Custom domain the SPA is served at. Production should NOT run on the default *.cloudfront.net hostname."
  type        = string
}

variable "frontend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for frontend_domain_name."
  type        = string
}

variable "frontend_acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) covering frontend_domain_name."
  type        = string
}

variable "frontend_price_class" {
  description = "CloudFront price class. PriceClass_All recommended for production."
  type        = string
  default     = "PriceClass_All"
}

# ── Network ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of AZs (2 or 3). Use 3 for maximum production resilience."
  type        = number
  default     = 3
}

# ── Backend container ─────────────────────────────────────────────────────

variable "backend_image" {
  description = "Docker image for the backend. Pin to a versioned tag in production — never use `latest`."
  type        = string
}

variable "backend_image_credentials_secret_arn" {
  description = "Secrets Manager ARN containing GHCR credentials {username, password}."
  type        = string
  default     = ""
}

variable "backend_container_port" {
  description = "Port the backend container listens on."
  type        = number
  default     = 3000
}

variable "backend_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 1024
}

variable "backend_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 2048
}

variable "backend_desired_count" {
  description = "Initial desired task count. Autoscaling adjusts from min_count=2."
  type        = number
  default     = 2
}

variable "backend_secret_arns" {
  description = "Map of env-var name → Secrets Manager ARN injected into the container."
  type        = map(string)
  default     = {}
}

# ── Backend custom domain — REQUIRED for production ───────────────────────

variable "backend_domain_name" {
  description = "Custom hostname for the API ALB. Required for production (don't expose the raw ALB DNS name)."
  type        = string
}

variable "backend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for backend_domain_name."
  type        = string
}

variable "backend_acm_certificate_arn" {
  description = "ACM certificate ARN (same region as ALB) covering backend_domain_name. Enables HTTPS."
  type        = string
}
