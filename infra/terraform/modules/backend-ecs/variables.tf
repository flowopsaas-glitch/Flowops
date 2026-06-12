variable "environment" {
  description = "Environment name (staging | production)."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

# ── Networking (from the network module) ─────────────────────────────────

variable "vpc_id" {
  description = "VPC ID the ECS service and ALB live in."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB (must span at least 2 AZs)."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks. Tasks run here without a public IP."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group ID for the Application Load Balancer."
  type        = string
}

variable "ecs_security_group_id" {
  description = "Security group ID for ECS tasks (scoped to allow inbound only from the ALB SG)."
  type        = string
}

# ── Container image ───────────────────────────────────────────────────────

variable "backend_image" {
  description = "Docker image for the backend. e.g. ghcr.io/flowopsaas-glitch/flowops-backend:v1.0.0. Defaults to the GHCR image established in PR #11. Override with a pinned tag in production."
  type        = string
  default     = "ghcr.io/flowopsaas-glitch/flowops-backend:latest"
}

variable "image_credentials_secret_arn" {
  description = "Secrets Manager ARN containing registry credentials as JSON {\"username\":\"...\",\"password\":\"...\"} for pulling private images (e.g. GHCR). Leave empty if the image is public."
  type        = string
  default     = ""
}

# ── Container sizing ──────────────────────────────────────────────────────

variable "container_port" {
  description = "Port the backend container listens on."
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "Fargate task CPU units (256 | 512 | 1024 | 2048 | 4096). Must be compatible with the chosen memory."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory in MiB. Must be a valid value for the chosen CPU. See https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#task_size"
  type        = number
  default     = 1024
}

# ── Service sizing + autoscaling ─────────────────────────────────────────

variable "desired_count" {
  description = "Desired number of running tasks. Autoscaling adjusts within [min_count, max_count] when enabled."
  type        = number
  default     = 1
}

variable "min_count" {
  description = "Minimum number of tasks (autoscaling lower bound)."
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum number of tasks (autoscaling upper bound)."
  type        = number
  default     = 4
}

variable "enable_autoscaling" {
  description = "Enable CPU-based target-tracking autoscaling. Target: 70% average CPU. Set false for staging if you'd rather control desired_count manually."
  type        = bool
  default     = true
}

variable "autoscaling_cpu_target" {
  description = "CPU utilisation percentage that autoscaling targets."
  type        = number
  default     = 70
}

variable "health_check_grace_period_seconds" {
  description = "Seconds ECS waits before starting ALB health checks. Give the backend time to migrate the DB before receiving traffic."
  type        = number
  default     = 60
}

# ── Health check ─────────────────────────────────────────────────────────

variable "health_check_path" {
  description = "ALB target-group health-check path. The backend must return 2xx on this path."
  type        = string
  default     = "/health"
}

# ── Custom domain for the API ─────────────────────────────────────────────

variable "domain_name" {
  description = "Custom hostname for the ALB (e.g. 'api-staging.flowops.example'). Empty uses the raw ALB DNS name."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for domain_name. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (same region as the ALB) covering domain_name. If set, enables HTTPS and redirects HTTP. If empty, the ALB serves plain HTTP on port 80."
  type        = string
  default     = ""
}

# ── Runtime configuration ─────────────────────────────────────────────────

variable "environment_variables" {
  description = "Plain-text environment variables injected into the container. For secrets, use secret_arns instead."
  type        = map(string)
  default     = {}
}

variable "secret_arns" {
  description = "Map of container environment-variable name → Secrets Manager secret ARN. The execution role is automatically granted GetSecretValue on these ARNs. Example: { DATABASE_URL = \"arn:aws:secretsmanager:...\" }"
  type        = map(string)
  default     = {}
}

# ── Logs ─────────────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "CloudWatch Log Group retention in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags merged onto every resource."
  type        = map(string)
  default     = {}
}
