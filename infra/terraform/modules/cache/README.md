# `modules/cache` — ElastiCache Redis

Status: **complete** (Phase C.3).

## What this module provisions

| Resource | Details |
|---|---|
| `aws_elasticache_subnet_group` | Spans all provided private subnets |
| `aws_elasticache_replication_group` | Redis 7.1, single shard (no cluster mode), configurable node count |

## Connection URL

The `redis_url` output is ready to pass directly as the `REDIS_URL` environment variable:

```hcl
plain_environment_variables = {
  REDIS_URL = module.cache.redis_url   # redis://host:6379
}
```

When `transit_encryption_enabled = true`, the URL uses the `rediss://` scheme automatically.
The backend's Redis client (ioredis / Bull) detects the scheme and enables TLS accordingly.

## Staging vs production settings

| Variable | Staging | Production |
|---|---|---|
| `node_type` | `cache.t4g.micro` | `cache.t4g.small` or `cache.r7g.large` |
| `num_cache_clusters` | `1` | `2` (primary + replica) |
| `multi_az_enabled` | `false` | `true` |
| `automatic_failover_enabled` | `false` | `true` |
| `transit_encryption_enabled` | `false` | `true` |
| `snapshot_retention_limit` | `1` | `7` |
| `apply_immediately` | `true` | `false` (deferred to maintenance window) |

## Scaling

ElastiCache replication groups can be scaled up by modifying `node_type` in-place
(no replace, brief ~1-2 min failover during modification). Adding replicas is a
non-destructive change.
