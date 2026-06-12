locals {
  name_prefix = "flowops-${var.environment}"

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      Component   = "cache"
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# ── Subnet group ─────────────────────────────────────────────────────────

resource "aws_elasticache_subnet_group" "main" {
  name        = local.name_prefix
  subnet_ids  = var.private_subnet_ids
  description = "FlowOps ${var.environment} Redis subnet group"

  tags = local.common_tags
}

# ── Replication group (Redis) ─────────────────────────────────────────────
# cluster_mode_enabled is implicitly false (num_node_groups = 1) which is
# the standard mode. The Prisma/ioredis client in the backend doesn't need
# cluster-mode logic for a single shard.

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = local.name_prefix
  description          = "FlowOps ${var.environment} Redis"

  engine         = "redis"
  engine_version = var.engine_version
  node_type      = var.node_type

  num_cache_clusters = var.num_cache_clusters

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.redis_security_group_id]

  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  transit_encryption_enabled = var.transit_encryption_enabled

  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled           = var.multi_az_enabled

  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window          = "02:00-03:00"
  maintenance_window       = "sun:04:00-sun:05:00"

  auto_minor_version_upgrade = true

  apply_immediately = var.environment != "production"

  tags = local.common_tags
}
