# `modules/database` — RDS Postgres

Status: **complete** (Phase C.3).

## What this module provisions

| Resource | Details |
|---|---|
| `aws_db_subnet_group` | Spans all provided private subnets |
| `aws_db_parameter_group` | Postgres 16 family; UTF-8 encoding, slow-query logging (>1s), connection logging |
| `random_password` | 32-char password; special chars safe for connection strings |
| `aws_db_instance` | Postgres 16, gp3 encrypted storage, enhanced monitoring (60s), Performance Insights |
| `aws_iam_role` | Enhanced monitoring role (`AmazonRDSEnhancedMonitoringRole`) |
| `aws_secretsmanager_secret` | RDS credentials at `flowops/<env>/rds` |
| `aws_secretsmanager_secret_version` | JSON with `host`, `port`, `dbname`, `username`, `password`, `DATABASE_URL` |

## Credentials pattern

The `DATABASE_URL` is built by Terraform on creation and stored in Secrets Manager:

```
postgresql://flowops:<password>@<host>:5432/flowops?schema=public&connection_limit=5
```

The `?connection_limit=5` is Prisma-friendly — keeps connection pool size bounded per task.
(With 2 tasks at max, total pool = 10 connections vs default 100.)

Reference it in ECS via:
```hcl
secret_environment_variables = {
  DATABASE_URL = "${module.database.credentials_secret_arn}:DATABASE_URL::"
}
```

## Password rotation

Terraform sets `ignore_changes = [password]` on the instance and `ignore_changes = [secret_string]`
on the credentials secret. To rotate:

1. Update the RDS master password via the console or CLI.
2. Update the Secrets Manager secret to match.
3. Trigger an ECS rolling deploy so tasks pick up the new secret.

(Automated rotation via Lambda is out of scope but recommended for production.)

## Staging vs production settings

| Variable | Staging | Production |
|---|---|---|
| `instance_class` | `db.t4g.micro` | `db.t4g.small` or larger |
| `multi_az` | `false` | `true` |
| `deletion_protection` | `false` | `true` |
| `skip_final_snapshot` | `true` | `false` |
| `backup_retention_days` | `7` | `14–35` |
| `performance_insights_retention_period` | 7 days | 2 years |
