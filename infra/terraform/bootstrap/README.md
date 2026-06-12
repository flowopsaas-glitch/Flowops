# `bootstrap/` — Terraform remote-state backend

Run this **once per AWS account / region** before applying any other stack.

Provisions:

- An **S3 bucket** to hold remote `terraform.tfstate` for every other stack. Versioned, encrypted (SSE-S3), public-access-blocked.
- A **DynamoDB table** for state locking, so two `terraform apply` invocations from different machines can't race.
- An IAM policy document (output only — not attached) scoping "state-only" access to the above resources.

This stack uses **local state** (`terraform.tfstate` in this directory). It can't use itself as a backend.

## Apply

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
```

## After apply

Three values matter — see `outputs.tf` after apply:

- `state_bucket_name` — pass into every env's `backend.tf` `bucket = ...`
- `lock_table_name`   — pass into every env's `backend.tf` `dynamodb_table = ...`
- `aws_region`        — pass into every env's `backend.tf` `region = ...`

The defaults match what's in `envs/<env>/backend.tf` so you usually don't
need to override anything.

## Where does the bootstrap state itself live?

Default: `terraform.tfstate` in this directory, gitignored. Back it up
via team password manager / encrypted shared storage.

After bootstrap is done you CAN migrate the bootstrap state to the same
S3 bucket it just created (`terraform init -migrate-state`). Some teams
prefer that for symmetry. Not the default.
