variable "environment" {
  description = "Environment name (staging | production)."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

# ── Network ───────────────────────────────────────────────────────────────

variable "private_subnet_ids" {
  description = "Private subnet IDs for the ElastiCache subnet group."
  type        = list(string)
}

variable "redis_security_group_id" {
  description = "Redis security group ID from the network module."
  type        = string
}

# ── Engine ────────────────────────────────────────────────────────────────

variable "engine_version" {
  description = "Redis engine version. ElastiCache supports 7.x; use the full patch version."
  type        = string
  default     = "7.1"
}

variable "node_type" {
  description = "ElastiCache node type. cache.t4g.micro is suitable for staging; cache.t4g.small or cache.r7g.large for production."
  type        = string
  default     = "cache.t4g.micro"
}

# ── HA ────────────────────────────────────────────────────────────────────

variable "num_cache_clusters" {
  description = "Number of cache clusters (nodes). Use 1 for staging, 2 for production (enables automatic failover)."
  type        = number
  default     = 1
}

variable "multi_az_enabled" {
  description = "Enable Multi-AZ with automatic failover. Requires num_cache_clusters >= 2."
  type        = bool
  default     = false
}

variable "automatic_failover_enabled" {
  description = "Enable automatic failover. Required when multi_az_enabled = true. Also requires num_cache_clusters >= 2."
  type        = bool
  default     = false
}

# ── Security ──────────────────────────────────────────────────────────────

variable "transit_encryption_enabled" {
  description = "Enable TLS for Redis connections. When true, use 'rediss://' in the connection string instead of 'redis://'."
  type        = bool
  default     = false
}

variable "at_rest_encryption_enabled" {
  description = "Enable encryption at rest using the default AWS-managed key."
  type        = bool
  default     = true
}

# ── Snapshots ─────────────────────────────────────────────────────────────

variable "snapshot_retention_limit" {
  description = "Number of daily snapshots to retain. 0 disables snapshots."
  type        = number
  default     = 1
}

# ── Tags ──────────────────────────────────────────────────────────────────

variable "tags" {
  description = "Additional tags applied to every resource."
  type        = map(string)
  default     = {}
}
