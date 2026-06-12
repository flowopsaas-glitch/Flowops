variable "environment" {
  description = "Environment name (staging | production)."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

# ── Network ───────────────────────────────────────────────────────────────

variable "vpc_id" {
  description = "VPC ID from the network module (used for the subnet group)."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs from the network module. RDS is placed in these subnets."
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "RDS security group ID from the network module."
  type        = string
}

# ── Engine ────────────────────────────────────────────────────────────────

variable "engine_version" {
  description = "Postgres engine version. Changing this after creation triggers a modification (or replacement for major version upgrades)."
  type        = string
  default     = "16.3"
}

variable "parameter_group_family" {
  description = "DB parameter group family, e.g. 'postgres16'. Must match the major version of engine_version."
  type        = string
  default     = "postgres16"
}

# ── Sizing ────────────────────────────────────────────────────────────────

variable "instance_class" {
  description = "RDS instance class. db.t4g.micro is suitable for staging; db.t4g.small or larger for production."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Initial allocated storage in GiB."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum storage autoscaling ceiling in GiB. Set to the same as allocated_storage to disable autoscaling."
  type        = number
  default     = 100
}

# ── Database ──────────────────────────────────────────────────────────────

variable "database_name" {
  description = "Name of the initial database created on the instance."
  type        = string
  default     = "flowops"
}

variable "master_username" {
  description = "Master username. Cannot be changed after creation."
  type        = string
  default     = "flowops"
}

# ── HA / backups ─────────────────────────────────────────────────────────

variable "multi_az" {
  description = "Enable Multi-AZ standby replica. Adds ~2x cost but provides automatic failover. Recommended for production."
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups. 0 disables backups."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Enable RDS deletion protection. Set to true in production."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "If false, a final snapshot is taken before deletion. Set to false in production."
  type        = bool
  default     = true
}

variable "final_snapshot_identifier" {
  description = "Identifier for the final snapshot when skip_final_snapshot = false. Defaults to 'flowops-<env>-final'."
  type        = string
  default     = ""
}

# ── Secrets ───────────────────────────────────────────────────────────────

variable "credentials_secret_recovery_window_days" {
  description = "Recovery window for the RDS credentials secret. 0 = force-delete. Use 7 for staging, 30 for production."
  type        = number
  default     = 7
}

# ── Tags ──────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Additional tags applied to every resource."
  type        = map(string)
  default     = {}
}
