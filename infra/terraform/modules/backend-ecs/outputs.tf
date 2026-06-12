output "ecs_cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name. Used by the CI deploy pipeline: aws ecs update-service --cluster ... --service ... --force-new-deployment"
  value       = aws_ecs_service.backend.name
}

output "task_definition_arn" {
  description = "Latest active task definition ARN."
  value       = aws_ecs_task_definition.backend.arn
}

output "task_role_arn" {
  description = "ARN of the task IAM role (application permissions). Attach extra policies here for S3 upload, SQS, etc."
  value       = aws_iam_role.task.arn
}

output "task_execution_role_arn" {
  description = "ARN of the task execution IAM role (used by ECS to pull images and read secrets)."
  value       = aws_iam_role.task_execution.arn
}

output "alb_arn" {
  description = "ALB ARN."
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS name. Use this as the API base URL when no custom domain is configured."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Canonical hosted zone ID of the ALB (for Route 53 alias records)."
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "ALB target group ARN."
  value       = aws_lb_target_group.backend.arn
}

output "log_group_name" {
  description = "CloudWatch Log Group name: /ecs/flowops/<environment>/backend"
  value       = aws_cloudwatch_log_group.backend.name
}

output "api_url" {
  description = "Public API URL — custom domain if configured, otherwise the ALB DNS name."
  value = (
    var.domain_name != ""
    ? "https://${var.domain_name}"
    : "http://${aws_lb.main.dns_name}"
  )
}
