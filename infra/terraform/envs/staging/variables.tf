# ── Region ────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region this env's resources live in. CloudFront / ACM cert resources always also touch us-east-1."
  type        = string
  default     = "us-east-1"
}

# ── Frontend CDN ──────────────────────────────────────────────────────────

variable "frontend_domain_name" {
  description = "Custom domain the SPA is served at (e.g. 'app-staging.flowops.example'). Empty = use the *.cloudfront.net hostname."
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
  description = "CloudFront price class."
  type        = string
  default     = "PriceClass_100"
}

# ── Network ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of AZs (2 or 3)."
  type        = number
  default     = 2
}

# ── Backend container ─────────────────────────────────────────────────────

variable "backend_image" {
  description = "Docker image for the backend. e.g. ghcr.io/flowopsaas-glitch/flowops-backend:v1.0.0"
  type        = string
  default     = "ghcr.io/flowopsaas-glitch/flowops-backend:latest"
}

variable "backend_image_credentials_secret_arn" {
  description = "Secrets Manager ARN containing GHCR credentials {username, password}. Leave empty for public images."
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
  default     = 512
}

variable "backend_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Desired number of backend tasks."
  type        = number
  default     = 1
}

variable "backend_secret_arns" {
  description = "Map of env-var name → Secrets Manager ARN injected into the container. Populate after Phase C.3 secrets module is wired in. e.g. { DATABASE_URL = \"arn:aws:secretsmanager:...\" }"
  type        = map(string)
  default     = {}
}

# ── Backend custom domain ─────────────────────────────────────────────────

variable "backend_domain_name" {
  description = "Custom hostname for the API ALB (e.g. 'api-staging.flowops.example'). Empty = use the raw ALB DNS name over HTTP."
  type        = string
  default     = ""
}

variable "backend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for backend_domain_name."
  type        = string
  default     = ""
}

variable "backend_acm_certificate_arn" {
  description = "ACM certificate ARN (same region as the ALB) for the backend domain. Enables HTTPS on the ALB."
  type        = string
  default     = ""
}
