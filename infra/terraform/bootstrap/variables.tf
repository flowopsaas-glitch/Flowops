variable "aws_region" {
  description = "AWS region the state bucket and lock table live in. Other stacks can run in different regions but their state lives here."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket that holds Terraform remote state for every FlowOps stack. Must be globally unique. Default suffixes the AWS account id so this is collision-free per account."
  type        = string
  default     = ""
}

variable "lock_table_name" {
  description = "DynamoDB table used for Terraform state locking."
  type        = string
  default     = "flowops-terraform-locks"
}

variable "force_destroy_state_bucket" {
  description = "If true, `terraform destroy` will empty the state bucket before deleting it. Always false in real usage — set true only when tearing down a sandbox account."
  type        = bool
  default     = false
}
