locals {
  name_prefix = "flowops-${var.environment}"

  final_snapshot_id = (
    var.final_snapshot_identifier != ""
    ? var.final_snapshot_identifier
    : "${local.name_prefix}-final"
  )

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      Component   = "database"
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# ── Master password ───────────────────────────────────────────────────────
# Generated once at create-time. The lifecycle in aws_db_instance ignores
# password changes so rotating via Secrets Manager won't cause a replace.

resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#%&*()-_=+[]{}<>?"
  # Exclude characters that can break postgresql:// connection strings
  # (/, @, :) and shell-special chars (@, $, `, |).
}

# ── Subnet group ─────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "main" {
  name        = local.name_prefix
  subnet_ids  = var.private_subnet_ids
  description = "FlowOps ${var.environment} RDS subnet group"

  tags = local.common_tags
}

# ── Parameter group ───────────────────────────────────────────────────────

resource "aws_db_parameter_group" "main" {
  name   = "${local.name_prefix}-params"
  family = var.parameter_group_family

  # UTF-8 default encoding for all new databases/connections.
  parameter {
    name  = "client_encoding"
    value = "UTF8"
  }

  # Log queries that take longer than 1 second (helps identify N+1 issues).
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Log connection attempts for audit trail (matches POPIA requirements).
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = local.common_tags
}

# ── RDS instance ──────────────────────────────────────────────────────────

resource "aws_db_instance" "main" {
  identifier = local.name_prefix

  # Engine
  engine         = "postgres"
  engine_version = var.engine_version

  # Sizing
  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  # Credentials
  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false

  # Configuration
  parameter_group_name       = aws_db_parameter_group.main.name
  auto_minor_version_upgrade = true

  # HA + disaster recovery
  multi_az                  = var.multi_az
  backup_retention_period   = var.backup_retention_days
  backup_window             = "03:00-04:00"
  maintenance_window        = "sun:05:00-sun:06:00"
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : local.final_snapshot_id
  copy_tags_to_snapshot     = true

  # Observability
  performance_insights_enabled          = true
  performance_insights_retention_period = var.environment == "production" ? 731 : 7
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  # Monitoring — enhanced metrics every 60s.
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_enhanced_monitoring.arn

  tags = local.common_tags

  lifecycle {
    # After initial creation, password is managed via Secrets Manager rotation
    # (or manual update). Prevent Terraform from resetting it.
    ignore_changes = [password]
  }
}

# ── Enhanced monitoring role ──────────────────────────────────────────────

data "aws_iam_policy_document" "rds_monitoring_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_enhanced_monitoring" {
  name               = "${local.name_prefix}-rds-monitoring"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── Credentials secret ────────────────────────────────────────────────────
# Stores the full connection details as a JSON object. The application
# can reference DATABASE_URL directly from Secrets Manager via ECS secrets
# injection: { valueFrom = "<arn>:DATABASE_URL::" }

resource "aws_secretsmanager_secret" "rds" {
  name                    = "flowops/${var.environment}/rds"
  description             = "FlowOps ${var.environment} RDS Postgres connection credentials"
  recovery_window_in_days = var.credentials_secret_recovery_window_days

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "rds" {
  secret_id = aws_secretsmanager_secret.rds.id

  secret_string = jsonencode({
    engine       = "postgres"
    host         = aws_db_instance.main.address
    port         = tostring(aws_db_instance.main.port)
    dbname       = aws_db_instance.main.db_name
    username     = aws_db_instance.main.username
    password     = random_password.master.result
    DATABASE_URL = "postgresql://${aws_db_instance.main.username}:${urlencode(random_password.master.result)}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?schema=public&connection_limit=5"
  })

  lifecycle {
    # Only update if the password resource is replaced (which we prevent
    # with ignore_changes on the instance). Manual rotation should update
    # this secret and the instance password via aws secretsmanager rotate-secret.
    ignore_changes = [secret_string]
  }
}
