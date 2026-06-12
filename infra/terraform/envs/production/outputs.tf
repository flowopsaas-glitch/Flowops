# ── Frontend ──────────────────────────────────────────────────────────────

output "frontend_url" {
  description = "Public URL of the SPA."
  value       = module.frontend_cdn.url
}

output "frontend_bucket_name" {
  description = "S3 bucket to upload the SPA bundle to."
  value       = module.frontend_cdn.bucket_name
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID for cache invalidations."
  value       = module.frontend_cdn.distribution_id
}

# ── Network ───────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID."
  value       = module.network.vpc_id
}

output "nat_public_ips" {
  description = "Elastic IPs of the NAT Gateways. Allowlist on external services the backend calls."
  value       = module.network.nat_public_ips
}

# ── Backend ───────────────────────────────────────────────────────────────

output "api_url" {
  description = "Public API URL."
  value       = module.backend_ecs.api_url
}

output "alb_dns_name" {
  description = "Raw ALB DNS name."
  value       = module.backend_ecs.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = module.backend_ecs.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = module.backend_ecs.ecs_service_name
}

output "log_group_name" {
  description = "CloudWatch Log Group name for backend logs."
  value       = module.backend_ecs.log_group_name
}

output "task_role_arn" {
  description = "Task IAM role ARN."
  value       = module.backend_ecs.task_role_arn
}
