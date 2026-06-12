output "primary_endpoint_address" {
  description = "Primary endpoint hostname of the Redis replication group."
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint_address" {
  description = "Reader endpoint hostname (load-balances across replicas). Use for read-heavy workloads."
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "port" {
  description = "Redis port (always 6379)."
  value       = aws_elasticache_replication_group.main.port
}

output "redis_url" {
  description = "Redis connection URL. Uses 'redis://' (no TLS) or 'rediss://' (TLS) depending on transit_encryption_enabled. Pass this as the REDIS_URL environment variable."
  value = format(
    "%s://%s:%d",
    var.transit_encryption_enabled ? "rediss" : "redis",
    aws_elasticache_replication_group.main.primary_endpoint_address,
    aws_elasticache_replication_group.main.port,
  )
}

output "replication_group_id" {
  description = "Replication group ID."
  value       = aws_elasticache_replication_group.main.id
}

output "replication_group_arn" {
  description = "Replication group ARN."
  value       = aws_elasticache_replication_group.main.arn
}
