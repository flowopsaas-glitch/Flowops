variable "environment" {
  description = "Environment name (staging | production). Used in resource names and tags."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

# ── Network ───────────────────────────────────────────────────────────────

variable "vpc_id" {
  description = "VPC ID from the network module."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB (one per AZ)."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks (one per AZ)."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "ALB security group ID from the network module."
  type        = string
}

variable "ecs_security_group_id" {
  description = "ECS tasks security group ID from the network module."
  type        = string
}

# ── Container ─────────────────────────────────────────────────────────────

variable "backend_image" {
  description = "Full container image reference, e.g. ghcr.io/flowopsaas-glitch/flowops-backend:sha-abc1234. Tag required — avoid using 'latest' in production."
  type        = string
}

variable "container_port" {
  description = "Port the backend container listens on."
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "Fargate task CPU units. Valid values: 256, 512, 1024, 2048, 4096."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory (MiB). Must be compatible with the chosen cpu value."
  type        = number
  default     = 1024
}

variable "health_check_path" {
  description = "HTTP path the ALB and the container health check probe."
  type        = string
  default     = "/health"
}

# ── ECS service sizing ────────────────────────────────────────────────────

variable "desired_count" {
  description = "Initial number of running tasks. Auto Scaling adjusts from this baseline."
  type        = number
  default     = 1
}

variable "min_count" {
  description = "Minimum number of tasks Auto Scaling will scale in to."
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum number of tasks Auto Scaling will scale out to."
  type        = number
  default     = 4
}

variable "cpu_scale_out_threshold" {
  description = "Target CPU utilisation % for the Auto Scaling target-tracking policy."
  type        = number
  default     = 70
}

variable "deployment_minimum_healthy_percent" {
  description = "Minimum % of tasks that must stay healthy during a rolling deploy."
  type        = number
  default     = 50
}

variable "deployment_maximum_percent" {
  description = "Maximum % of tasks that can be running during a rolling deploy."
  type        = number
  default     = 200
}

# ── Environment variables ─────────────────────────────────────────────────

variable "plain_environment_variables" {
  description = "Non-secret environment variables injected into the container. These are visible in plain text in the task definition — use secret_environment_variables for anything sensitive."
  type        = map(string)
  default     = {}
}

variable "secret_environment_variables" {
  description = "Secret environment variables injected via ECS secrets integration. Map of ENV_VAR_NAME → Secrets Manager ARN (or ARN:JsonKey:: for a specific JSON key). The task execution role is granted GetSecretValue on all referenced ARNs."
  type        = map(string)
  default     = {}
  sensitive   = true
}

# ── Image pull credentials (GHCR or other private registries) ─────────────

variable "registry_credentials_secret_arn" {
  description = "ARN of a Secrets Manager secret containing Docker registry credentials ({\"username\": \"...\", \"password\": \"...\"}). Required if pulling from a private registry like GHCR. Leave empty for public images or ECR (IAM-native)."
  type        = string
  default     = ""
}

# ── Custom domain + TLS ───────────────────────────────────────────────────

variable "domain_name" {
  description = "Custom domain for the API, e.g. 'api-staging.flowops.example'. Empty = use the ALB's default *.elb.amazonaws.com hostname."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for domain_name. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate in the deployment region covering domain_name. Required if domain_name is set."
  type        = string
  default     = ""
}

# ── Observability ─────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "CloudWatch Log Group retention in days."
  type        = number
  default     = 30
}

# ── Tags ──────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Additional tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
