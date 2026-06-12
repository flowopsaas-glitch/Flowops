output "state_bucket_name" {
  description = "Pass to every env's backend.tf as `bucket = ...`"
  value       = aws_s3_bucket.state.id
}

output "state_bucket_arn" {
  description = "ARN of the state bucket."
  value       = aws_s3_bucket.state.arn
}

output "lock_table_name" {
  description = "Pass to every env's backend.tf as `dynamodb_table = ...`"
  value       = aws_dynamodb_table.lock.id
}

output "lock_table_arn" {
  description = "ARN of the lock table."
  value       = aws_dynamodb_table.lock.arn
}

output "aws_region" {
  description = "Region the bootstrap was applied in. Pass as `region = ...` in every env's backend.tf."
  value       = var.aws_region
}

output "state_access_policy_json" {
  description = "Re-usable IAM policy JSON granting exactly enough to read/write state and acquire/release locks. Attach to a role/user separately."
  value       = data.aws_iam_policy_document.state_access.json
}
