output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "CIDR block of the VPC."
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs (one per AZ). ALB and NAT Gateways live here."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs (one per AZ). ECS tasks, RDS, and Redis live here."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Security group ID for the Application Load Balancer (public-facing)."
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS Fargate tasks."
  value       = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  description = "Security group ID for RDS Postgres. Pass to the database module."
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "Security group ID for ElastiCache Redis. Pass to the cache module."
  value       = aws_security_group.redis.id
}

output "nat_gateway_public_ips" {
  description = "Public IPs of the NAT Gateways. Useful for whitelisting in external services (e.g. SendGrid, Cloudflare IP rules)."
  value       = aws_eip.nat[*].public_ip
}
