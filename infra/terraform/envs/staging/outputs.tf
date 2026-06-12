output "frontend_url" {
  description = "Public URL of the SPA."
  value       = module.frontend_cdn.url
}

output "frontend_bucket_name" {
  description = "S3 bucket the CI deploy step uploads dist/ to."
  value       = module.frontend_cdn.bucket_name
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID for cache invalidations."
  value       = module.frontend_cdn.distribution_id
}

output "vpc_id" {
  description = "VPC ID."
  value       = module.network.vpc_id
}

output "nat_gateway_public_ips" {
  description = "NAT Gateway public IPs — whitelist these in external services (SendGrid, Cloudflare R2 IP rules, etc.)."
  value       = module.network.nat_gateway_public_ips
}

output "backend_url" {
  description = "Base URL for the backend API."
  value       = module.backend_ecs.backend_url
}

output "backend_alb_dns_name" {
  description = "Raw ALB DNS name. Useful as a fallback if the custom domain is not yet configured."
  value       = module.backend_ecs.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name — used by CI to deploy new task revisions."
  value       = module.backend_ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name — used by CI to update the service."
  value       = module.backend_ecs.service_name
}

output "backend_log_group" {
  description = "CloudWatch Log Group for backend container logs."
  value       = module.backend_ecs.log_group_name
}
