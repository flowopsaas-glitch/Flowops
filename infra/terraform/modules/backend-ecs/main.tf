data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  use_https         = var.acm_certificate_arn != ""
  use_custom_domain = var.domain_name != ""

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

# ── Cross-cutting validation ──────────────────────────────────────────────

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
  name              = "/ecs/flowops/${var.environment}/backend"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

# ── IAM: Task Execution Role ─────────────────────────────────────────────
# Used by ECS to pull the image, write logs, and read Secrets Manager.

data "aws_iam_policy_document" "execution_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "flowops-${var.environment}-backend-execution"
  assume_role_policy = data.aws_iam_policy_document.execution_trust.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "task_execution_base" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Grant access to Secrets Manager for secret injection and image credentials.
data "aws_iam_policy_document" "execution_secrets" {
  count = (length(var.secret_arns) > 0 || var.image_credentials_secret_arn != "") ? 1 : 0

  statement {
    sid    = "GetSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = compact(concat(
      values(var.secret_arns),
      [var.image_credentials_secret_arn],
    ))
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  count  = (length(var.secret_arns) > 0 || var.image_credentials_secret_arn != "") ? 1 : 0
  name   = "flowops-${var.environment}-backend-execution-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.execution_secrets[0].json
}

# ── IAM: Task Role ────────────────────────────────────────────────────────
# Permissions the backend *application* uses at runtime. Start empty; attach
# extra policies (e.g. S3 upload, SQS) in the calling env as needed.

resource "aws_iam_role" "task" {
  name               = "flowops-${var.environment}-backend-task"
  assume_role_policy = data.aws_iam_policy_document.execution_trust.json
  tags               = local.common_tags
}

# ── ECS Cluster ───────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "flowops-${var.environment}"

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
    base              = 1
  }
}

# ── ECS Task Definition ───────────────────────────────────────────────────

resource "aws_ecs_task_definition" "backend" {
  family                   = "flowops-${var.environment}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    merge(
      {
        name      = "backend"
        image     = var.backend_image
        essential = true

        portMappings = [
          {
            containerPort = var.container_port
            protocol      = "tcp"
          }
        ]

        environment = [
          for k, v in merge(
            {
              NODE_ENV = "production"
              PORT     = tostring(var.container_port)
            },
            var.environment_variables,
          ) : { name = k, value = v }
        ]

        secrets = [
          for name, arn in var.secret_arns : {
            name      = name
            valueFrom = arn
          }
        ]

        logConfiguration = {
          logDriver = "awslogs"
          options = {
            "awslogs-group"         = aws_cloudwatch_log_group.backend.name
            "awslogs-region"        = data.aws_region.current.name
            "awslogs-stream-prefix" = "ecs"
          }
        }

        healthCheck = {
          command = [
            "CMD-SHELL",
            "wget --quiet --tries=1 --spider http://localhost:${var.container_port}${var.health_check_path} || exit 1",
          ]
          interval    = 30
          timeout     = 5
          retries     = 3
          startPeriod = var.health_check_grace_period_seconds
        }

        readonlyRootFilesystem = false
        stopTimeout            = 30
      },
      # Registry credentials — omit entirely when not set (jsonencode drops null).
      var.image_credentials_secret_arn != "" ? {
        repositoryCredentials = {
          credentialsParameter = var.image_credentials_secret_arn
        }
      } : {},
    )
  ])

  tags = local.common_tags

  lifecycle {
    # Allow the CD pipeline to roll out new image tags without Terraform conflicts.
    ignore_changes = [container_definitions]
  }
}

# ── Application Load Balancer ─────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "flowops-${var.environment}-backend"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "production" ? true : false

  tags = local.common_tags
}

resource "aws_lb_target_group" "backend" {
  name        = "flowops-${var.environment}-backend"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # Fargate uses awsvpc networking — targets are IPs

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-299"
    path                = var.health_check_path
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

# HTTPS listener — enabled when an ACM cert is provided.
resource "aws_lb_listener" "https" {
  count = local.use_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
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

# HTTP → HTTPS redirect (when HTTPS is configured).
resource "aws_lb_listener" "http_redirect" {
  count = local.use_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = local.common_tags
}

# Plain HTTP listener — used when no ACM cert is configured (e.g. staging without a domain).
resource "aws_lb_listener" "http_direct" {
  count = local.use_https ? 0 : 1

  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  tags = local.common_tags
}

# ── ECS Service ───────────────────────────────────────────────────────────

resource "aws_ecs_service" "backend" {
  name                              = "flowops-${var.environment}-backend"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.backend.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = var.health_check_grace_period_seconds
  force_new_deployment              = false # CI rolls deployments with new image tags

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

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http_redirect,
    aws_lb_listener.http_direct,
    aws_iam_role_policy_attachment.task_execution_base,
  ]

  tags = local.common_tags

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

# ── Autoscaling ───────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "backend" {
  count = var.enable_autoscaling ? 1 : 0

  max_capacity       = var.max_count
  min_capacity       = var.min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.backend]
}

resource "aws_appautoscaling_policy" "cpu" {
  count = var.enable_autoscaling ? 1 : 0

  name               = "flowops-${var.environment}-backend-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend[0].resource_id
  scalable_dimension = aws_appautoscaling_target.backend[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.autoscaling_cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ── Optional Route 53 alias for the API domain ────────────────────────────

resource "aws_route53_record" "api" {
  count = local.use_custom_domain ? 1 : 0

  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}
