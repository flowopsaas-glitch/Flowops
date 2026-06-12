variable "environment" {
  description = "Environment name (staging | production). Used in resource names and tags."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. Public subnets are /24 starting at .0; private subnets start at .10."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to spread across. At most min(3, available AZs in the region)."
  type        = number
  default     = 3
  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "single_nat_gateway" {
  description = "If true, one NAT Gateway is shared across all private subnets (cheaper; fine for staging). If false, one NAT Gateway per AZ (high-availability; recommended for production)."
  type        = bool
  default     = true
}

variable "enable_s3_endpoint" {
  description = "Create a VPC Gateway endpoint for S3. Free of charge and reduces NAT traffic for S3 calls from ECS tasks."
  type        = bool
  default     = true
}

variable "enable_secretsmanager_endpoint" {
  description = "Create a VPC Interface endpoint for Secrets Manager. Costs ~$0.01/hr per AZ but eliminates NAT traffic for secret-fetching on task start. Recommended for production."
  type        = bool
  default     = false
}

variable "backend_container_port" {
  description = "TCP port the backend container listens on. Used to scope the ALB → ECS security group egress rule."
  type        = number
  default     = 3000
}

variable "tags" {
  description = "Additional tags applied to every resource in this module."
  type        = map(string)
  default     = {}
}
