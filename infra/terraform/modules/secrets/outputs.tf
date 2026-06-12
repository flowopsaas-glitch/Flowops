output "secret_arn" {
  description = "ARN of the application Secrets Manager secret. Reference individual keys in ECS task definitions as: '<arn>:KEY_NAME::'. See README for the full pattern."
  value       = aws_secretsmanager_secret.app.arn
}

output "secret_name" {
  description = "Name of the secret (path). Use with: aws secretsmanager put-secret-value --secret-id <name>."
  value       = aws_secretsmanager_secret.app.name
}

output "secret_id" {
  description = "ID of the secret (same as name for named secrets)."
  value       = aws_secretsmanager_secret.app.id
}
