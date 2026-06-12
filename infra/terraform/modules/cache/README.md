# `modules/cache` — ElastiCache Redis (skeleton)

Status: **placeholder**, filled in by a subsequent PR.

Will provision:

- ElastiCache Redis (single node for staging, replication group for production).
- Subnet group across the network module's private subnets.
- At-rest + in-transit encryption.
- Auth token via Secrets Manager.
- CloudWatch alarms on memory and CPU.

Inputs (planned):

- `vpc_id`, `private_subnet_ids`
- `cache_node_type` (cache.t4g.micro for staging)
- `engine_version` (default `7.1`)
- `num_cache_nodes`
- `cache_security_group_id`

Outputs (planned):

- `primary_endpoint`, `port`, `auth_token_secret_arn`.
