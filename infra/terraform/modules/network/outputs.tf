output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "VPC CIDR block."
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet IDs (one per AZ). Pass to the backend-ecs module for the ALB."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (one per AZ). Pass to the backend-ecs module for ECS tasks, and to database/cache modules."
  value       = aws_subnet.private[*].id
}

output "availability_zones" {
  description = "AZs the VPC spans."
  value       = local.azs
}

output "alb_security_group_id" {
  description = "Security group ID for the ALB. Pass to the backend-ecs module."
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks. Pass to the backend-ecs module."
  value       = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  description = "Security group ID for RDS. Pass to the database module."
  value       = aws_security_group.rds.id
}

output "redis_security_group_id" {
  description = "Security group ID for Redis. Pass to the cache module."
  value       = aws_security_group.redis.id
}

output "nat_gateway_ids" {
  description = "NAT Gateway IDs."
  value       = aws_nat_gateway.main[*].id
}

output "nat_public_ips" {
  description = "Elastic IP addresses of the NAT Gateway(s). Useful for allowing outbound traffic from ECS tasks on a known IP."
  value       = aws_eip.nat[*].public_ip
}
