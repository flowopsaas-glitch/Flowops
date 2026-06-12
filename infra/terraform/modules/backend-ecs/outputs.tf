output "cluster_arn" {
  description = "ARN of the ECS cluster."
  value       = aws_ecs_cluster.main.arn
}

output "cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "service_arn" {
  description = "ARN of the ECS service."
  value       = aws_ecs_service.backend.id
}

output "service_name" {
  description = "Name of the ECS service."
  value       = aws_ecs_service.backend.name
}

output "task_definition_arn" {
  description = "ARN of the latest active task definition revision."
  value       = aws_ecs_task_definition.backend.arn
}

output "task_execution_role_arn" {
  description = "ARN of the ECS task execution role. The CI/CD pipeline needs iam:PassRole on this when registering new task definitions."
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "ARN of the application task role. Attach additional policies here for S3, SES, etc."
  value       = aws_iam_role.task.arn
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer."
  value       = aws_lb.backend.arn
}

output "alb_dns_name" {
  description = "DNS name of the ALB. Use this as the CNAME target if Route 53 is managed outside Terraform."
  value       = aws_lb.backend.dns_name
}

output "target_group_arn" {
  description = "ARN of the ALB target group. Used by the CI/CD pipeline to register new task sets."
  value       = aws_lb_target_group.backend.arn
}

output "log_group_name" {
  description = "CloudWatch Log Group name for the backend container. Use with `aws logs tail` for live debugging."
  value       = aws_cloudwatch_log_group.backend.name
}

output "log_group_arn" {
  description = "CloudWatch Log Group ARN."
  value       = aws_cloudwatch_log_group.backend.arn
}

output "backend_url" {
  description = "Base URL for the backend API. Uses the custom domain if set; falls back to the ALB DNS name."
  value = (
    var.domain_name != ""
    ? "https://${var.domain_name}"
    : "http://${aws_lb.backend.dns_name}"
  )
}
