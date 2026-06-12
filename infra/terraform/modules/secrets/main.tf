locals {
  secret_name = "${var.app_name}/${var.environment}/app"

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      Component   = "secrets"
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# ── Application secrets container ─────────────────────────────────────────
# This secret holds all runtime app credentials as a JSON object:
#   JWT_SECRET, SENDGRID_API_KEY, CLOUDFLARE_API_TOKEN, etc.
#
# ECS tasks inject individual keys via the secrets integration:
#   { name = "JWT_SECRET", valueFrom = "<arn>:JWT_SECRET::" }
#
# IMPORTANT: after `terraform apply`, update the real values:
#   aws secretsmanager put-secret-value \
#     --secret-id flowops/<env>/app \
#     --secret-string '{"JWT_SECRET":"...","SENDGRID_API_KEY":"...",...}'

resource "aws_secretsmanager_secret" "app" {
  name                    = local.secret_name
  description             = "FlowOps ${var.environment} application credentials (JWT, SendGrid, Cloudflare, etc.)"
  recovery_window_in_days = var.recovery_window_days

  tags = local.common_tags
}

# Initial placeholder version — written once on creation. The lifecycle
# block prevents Terraform from overwriting values the operator has set.
resource "aws_secretsmanager_secret_version" "initial" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(var.initial_secret_values)

  lifecycle {
    # Operator updates the secret content directly; Terraform must not
    # revert those changes on the next plan/apply.
    ignore_changes = [secret_string]
  }
}
