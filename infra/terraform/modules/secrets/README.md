# `modules/secrets` — Secrets Manager + IAM (skeleton)

Status: **placeholder**, filled in by a subsequent PR.

Will provision:

- Secrets Manager entries for: `JWT_SECRET`, third-party API keys (Sentry DSN), Cloudflare R2 credentials.
- IAM policy allowing the ECS task role to read these specific secret ARNs.
- (Database master credential and Redis auth token live in their own modules, not here.)

Inputs (planned):

- `environment`
- `secret_payload` (map of name → JSON string; Terraform never sees the raw values once written)

Outputs (planned):

- Map of secret name → ARN, for the backend-ecs module to wire into task definition `secrets`.
- IAM policy ARN to attach to the task role.

Notes:

- We do NOT store secret values in Terraform state. Use a one-shot `aws secretsmanager put-secret-value` after `terraform apply` to populate them, OR use `aws_secretsmanager_secret_version` with `lifecycle { ignore_changes = [secret_string] }` so Terraform creates the slot but doesn't manage the value.
