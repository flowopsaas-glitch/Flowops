data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name_prefix = "flowops-${var.environment}"

  use_custom_domain  = var.domain_name != ""
  use_registry_creds = var.registry_credentials_secret_arn != ""

  # Collect the unique set of Secrets Manager ARNs (base ARN without the
  # :Key:: suffix) so we can grant GetSecretValue on each one.
  secret_arns = distinct([
    for _, v in var.secret_environment_variables :
    split(":", v)[0] == "arn" ? join(":", slice(split(":", v), 0, 7)) : v
  ])

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      Component   = "backend-ecs"
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# Cross-cutting validation.
resource "terraform_data" "domain_validation" {
  lifecycle {
    precondition {
      condition = (
        var.domain_name == ""
        ||
        (var.hosted_zone_id != "" && var.acm_certificate_arn != "")
      )
      error_message = "If domain_name is set, both hosted_zone_id and acm_certificate_arn are required."
    }
  }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}/backend"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# ── IAM: Task Execution Role ──────────────────────────────────────────────
# Used by the ECS agent to pull the image and inject secrets into the task.

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "execution_base" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Grant GetSecretValue for all secrets referenced by secret_environment_variables.
data "aws_iam_policy_document" "execution_secrets" {
  count = length(local.secret_arns) > 0 ? 1 : 0

  statement {
    sid       = "ECSSecretsAccess"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.secret_arns
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  count  = length(local.secret_arns) > 0 ? 1 : 0
  name   = "secrets-access"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets[0].json
}

# Allow ECS to pull from private registries (GHCR, etc.).
data "aws_iam_policy_document" "execution_registry" {
  count = local.use_registry_creds ? 1 : 0

  statement {
    sid       = "RegistryCredentials"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.registry_credentials_secret_arn]
  }
}

resource "aws_iam_role_policy" "execution_registry" {
  count  = local.use_registry_creds ? 1 : 0
  name   = "registry-credentials"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_registry[0].json
}

# ── IAM: Task Role ────────────────────────────────────────────────────────
# Assumed by the running application. Add policies here for S3, SES, X-Ray,
# etc. as the backend grows.

resource "aws_iam_role" "task" {
  name               = "${local.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.common_tags
}

# X-Ray write permissions for OTel tracing (the backend has OTel wired).
resource "aws_iam_role_policy_attachment" "task_xray" {
  role       = aws_iam_role.task.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# CloudWatch Logs write so the application can ship structured logs.
data "aws_iam_policy_document" "task_logs" {
  statement {
    sid = "CloudWatchLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["${aws_cloudwatch_log_group.backend.arn}:*"]
  }
}

resource "aws_iam_role_policy" "task_logs" {
  name   = "cloudwatch-logs"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_logs.json
}

# ── ECS Cluster ───────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ── ECS Task Definition ───────────────────────────────────────────────────

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    merge(
      {
        name      = "backend"
        image     = var.backend_image
        essential = true

        portMappings = [{
          containerPort = var.container_port
          protocol      = "tcp"
          appProtocol   = "http"
        }]

        environment = [
          for k, v in var.plain_environment_variables : { name = k, value = v }
        ]

        secrets = [
          for k, v in var.secret_environment_variables : { name = k, valueFrom = v }
        ]

        logConfiguration = {
          logDriver = "awslogs"
          options = {
            awslogs-group         = aws_cloudwatch_log_group.backend.name
            awslogs-region        = data.aws_region.current.name
            awslogs-stream-prefix = "ecs"
          }
        }

        healthCheck = {
          command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}${var.health_check_path} || exit 1"]
          interval    = 30
          timeout     = 5
          retries     = 3
          startPeriod = 60
        }
      },
      # Only set repositoryCredentials when pulling from a private registry.
      local.use_registry_creds ? {
        repositoryCredentials = {
          credentialsParameter = var.registry_credentials_secret_arn
        }
      } : {},
    )
  ])

  tags = local.common_tags
}

# ── Application Load Balancer ─────────────────────────────────────────────

resource "aws_lb" "backend" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "production"
  drop_invalid_header_fields = true

  tags = local.common_tags
}

resource "aws_lb_target_group" "backend" {
  name        = "${local.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # required for awsvpc network mode

  health_check {
    enabled             = true
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200-299"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# HTTP listener — always present. Redirects to HTTPS when a cert is set;
# forwards directly otherwise (useful for internal / dev targets).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.acm_certificate_arn != "" ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = var.acm_certificate_arn == "" ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.backend.arn
    }
  }

  tags = local.common_tags
}

# HTTPS listener — only created when an ACM cert is supplied.
resource "aws_lb_listener" "https" {
  count = var.acm_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.backend.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  tags = local.common_tags
}

# ── Route 53 record for the custom API domain ─────────────────────────────

resource "aws_route53_record" "backend_a" {
  count   = local.use_custom_domain ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.backend.dns_name
    zone_id                = aws_lb.backend.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "backend_aaaa" {
  count   = local.use_custom_domain ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_lb.backend.dns_name
    zone_id                = aws_lb.backend.zone_id
    evaluate_target_health = true
  }
}

# ── ECS Service ───────────────────────────────────────────────────────────

resource "aws_ecs_service" "backend" {
  name            = "${local.name_prefix}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = var.deployment_minimum_healthy_percent
  deployment_maximum_percent         = var.deployment_maximum_percent

  # Rolling update with circuit breaker — auto-rollback if the new task
  # can't become healthy.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.container_port
  }

  # Ignore desired_count so Auto Scaling can adjust it without Terraform
  # fighting to reset it to the initial value on every plan.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy_attachment.execution_base,
  ]

  tags = local.common_tags
}

# ── Auto Scaling ──────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_count
  min_capacity       = var.min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Target-tracking on CPU — handles both scale-out and scale-in automatically.
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-cpu-tracking"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = var.cpu_scale_out_threshold
    scale_in_cooldown  = 300 # 5 min — don't scale in too aggressively
    scale_out_cooldown = 60  # 1 min — react quickly to traffic spikes
  }
}
