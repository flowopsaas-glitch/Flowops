# `modules/secrets` — AWS Secrets Manager application secret

Status: **complete** (Phase C.3).

## What this module provisions

| Resource | Details |
|---|---|
| `aws_secretsmanager_secret` | Secret container at `flowops/<environment>/app` |
| `aws_secretsmanager_secret_version` | Initial placeholder version (written once; `ignore_changes` prevents drift) |

## Design: Terraform manages the container, operator manages the content

Terraform only creates the secret *container* and writes a one-time placeholder version.
After `terraform apply`, the operator fills in real values:

```bash
aws secretsmanager put-secret-value \
  --secret-id flowops/staging/app \
  --secret-string '{
    "JWT_SECRET":            "...",
    "SENDGRID_API_KEY":      "...",
    "CLOUDFLARE_API_TOKEN":  "...",
    "CLOUDFLARE_ACCOUNT_ID": "...",
    "CLOUDFLARE_R2_BUCKET_NAME": "..."
  }'
```

Subsequent `terraform plan` runs see no drift — `ignore_changes = [secret_string]` is set.

## ECS secrets injection

The `backend-ecs` module's `secret_environment_variables` accepts ARN:Key:: references:

```hcl
secret_environment_variables = {
  JWT_SECRET       = "${module.secrets.secret_arn}:JWT_SECRET::"
  SENDGRID_API_KEY = "${module.secrets.secret_arn}:SENDGRID_API_KEY::"
}
```

The task execution role is automatically granted `GetSecretValue` on this ARN by the `backend-ecs` module.

## Adding new keys

1. Add the key to the secret via `aws secretsmanager put-secret-value` (merge with existing JSON).
2. Add a new entry to `secret_environment_variables` in the env `main.tf`.
3. `terraform apply` — updates the ECS task definition.
4. ECS rolling deploy picks up the new env var.

## Secret rotation

For automated rotation (e.g. JWT key cycling), add an `aws_secretsmanager_secret_rotation`
resource pointing to a Lambda function. Out of scope for this module.
