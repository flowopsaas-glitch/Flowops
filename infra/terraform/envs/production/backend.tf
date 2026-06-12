terraform {
  backend "s3" {
    bucket         = "flowops-tfstate"
    key            = "envs/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "flowops-terraform-locks"
    encrypt        = true
  }
}

# Same placeholder as staging — replace `bucket` with the bootstrap output
# OR override via `terraform init -backend-config="bucket=..."`.
