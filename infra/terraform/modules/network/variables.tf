variable "environment" {
  description = "Environment name (staging | production)."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to span. 2 is sufficient for staging; 3 recommended for production."
  type        = number
  default     = 2
  validation {
    condition     = contains([2, 3], var.az_count)
    error_message = "az_count must be 2 or 3."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for the public subnets (one per AZ). Leave empty to auto-compute from vpc_cidr using /24 slices."
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for the private subnets (one per AZ). Leave empty to auto-compute from vpc_cidr using /24 slices offset by 100."
  type        = list(string)
  default     = []
}

variable "single_nat_gateway" {
  description = "Create one shared NAT Gateway instead of one per AZ. Cheaper (true for staging), but a single-AZ failure disrupts private outbound traffic (false for production)."
  type        = bool
  default     = true
}

variable "enable_s3_vpc_endpoint" {
  description = "Create a Gateway VPC endpoint for S3. Reduces NAT costs for large S3 traffic (e.g. waybill uploads). Free to create."
  type        = bool
  default     = false
}

variable "enable_secretsmanager_vpc_endpoint" {
  description = "Create an Interface VPC endpoint for Secrets Manager. ECS tasks read secrets at startup — the endpoint avoids the NAT hop and slightly speeds startup. ~$7/month."
  type        = bool
  default     = false
}

variable "container_port" {
  description = "Port the backend container listens on. Used to scope the ECS security group inbound rule to only accept traffic from the ALB."
  type        = number
  default     = 3000
}

variable "tags" {
  description = "Additional tags merged onto every resource."
  type        = map(string)
  default     = {}
}
