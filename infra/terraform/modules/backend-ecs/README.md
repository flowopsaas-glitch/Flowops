# `modules/backend-ecs` — ECS Fargate service + ALB (skeleton)

Status: **placeholder**, filled in by a subsequent PR.

Will provision:

- ECS cluster (Fargate-only).
- Task definition for the backend container (image, CPU/memory, env from Secrets Manager).
- ECS service with auto-scaling on CPU.
- Application Load Balancer + target group + HTTPS listener.
- Health check on `/health`.
- CloudWatch Log Group + log stream.

Inputs (planned):

- `vpc_id`, `private_subnet_ids` (from network module)
- `public_subnet_ids` (ALB)
- `backend_image` (e.g. `ghcr.io/flowopsaas-glitch/flowops-backend:v1.2.3`)
- `cpu`, `memory` (Fargate sizes)
- `desired_count`, `max_count` (autoscaling)
- `domain_name`, `hosted_zone_id`, `acm_certificate_arn` (in the env's region)
- `secrets_manager_arn`

Outputs (planned):

- `service_arn`, `task_definition_arn`, `alb_dns_name`, `target_group_arn`, `log_group_name`.
