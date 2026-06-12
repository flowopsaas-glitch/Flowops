output "endpoint" {
  description = "RDS instance hostname (without port). Use credentials_secret_arn for the full DATABASE_URL."
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS instance port (always 5432 for Postgres)."
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "Name of the initial database."
  value       = aws_db_instance.main.db_name
}

output "master_username" {
  description = "RDS master username."
  value       = aws_db_instance.main.username
}

output "instance_id" {
  description = "RDS instance identifier."
  value       = aws_db_instance.main.id
}

output "instance_arn" {
  description = "RDS instance ARN."
  value       = aws_db_instance.main.arn
}

output "credentials_secret_arn" {
  description = "Secrets Manager ARN for the RDS credentials secret. Reference DATABASE_URL in ECS task definitions as: '<credentials_secret_arn>:DATABASE_URL::'. See README for the full pattern."
  value       = aws_secretsmanager_secret.rds.arn
}

output "credentials_secret_name" {
  description = "Secrets Manager secret name for the RDS credentials."
  value       = aws_secretsmanager_secret.rds.name
}
