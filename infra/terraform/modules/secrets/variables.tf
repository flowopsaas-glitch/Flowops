variable "environment" {
  description = "Environment name (staging | production)."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "app_name" {
  description = "Application name used to build the secret path: <app_name>/<environment>/app."
  type        = string
  default     = "flowops"
}

variable "recovery_window_days" {
  description = "Number of days Secrets Manager waits before permanently deleting a secret after a delete call. 0 = force-delete immediately (useful for dev). Use 7 for staging, 30 for production."
  type        = number
  default     = 7
  validation {
    condition     = var.recovery_window_days == 0 || (var.recovery_window_days >= 7 && var.recovery_window_days <= 30)
    error_message = "recovery_window_days must be 0 (force-delete) or between 7 and 30."
  }
}

variable "initial_secret_values" {
  description = "Placeholder key-value pairs written as the initial secret version. Terraform only writes this once (ignore_changes prevents drift). Update real values via the console or aws secretsmanager put-secret-value — never commit real credentials here."
  type        = map(string)
  sensitive   = true
  default = {
    JWT_SECRET                = "CHANGE_ME_BEFORE_FIRST_DEPLOY"
    SENDGRID_API_KEY          = "CHANGE_ME_BEFORE_FIRST_DEPLOY"
    CLOUDFLARE_API_TOKEN      = "CHANGE_ME_BEFORE_FIRST_DEPLOY"
    CLOUDFLARE_ACCOUNT_ID     = "CHANGE_ME_BEFORE_FIRST_DEPLOY"
    CLOUDFLARE_R2_BUCKET_NAME = "CHANGE_ME_BEFORE_FIRST_DEPLOY"
    SENTRY_DSN                = ""
  }
}

variable "tags" {
  description = "Additional tags applied to every resource."
  type        = map(string)
  default     = {}
}
