# `modules/database` — RDS Postgres (skeleton)

Status: **placeholder**, filled in by a subsequent PR.

Will provision:

- RDS Postgres 16 instance (single-AZ for staging, multi-AZ for production).
- DB subnet group across the network module's private subnets.
- Parameter group with sane Postgres defaults.
- Automated backups (7-day retention staging, 30-day production).
- Performance Insights enabled.
- Master credential rotated via Secrets Manager.

Inputs (planned):

- `vpc_id`, `private_subnet_ids`
- `instance_class` (db.t3.micro for staging, db.m5.large+ for production)
- `allocated_storage_gb`
- `engine_version` (default `16.4`)
- `multi_az`
- `backup_retention_days`
- `db_security_group_id`

Outputs (planned):

- `endpoint`, `port`, `database_name`, `secret_arn`.
