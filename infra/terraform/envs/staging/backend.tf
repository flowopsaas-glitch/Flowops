terraform {
  backend "s3" {
    bucket         = "flowops-tfstate"
    key            = "envs/staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "flowops-terraform-locks"
    encrypt        = true
  }
}

# NOTE: the literal "flowops-tfstate" bucket name is a placeholder. After
# running `bootstrap/`, replace it with the value of the `state_bucket_name`
# output (typically `flowops-tfstate-<account-id>`). Or override at init
# time without editing this file:
#
#   terraform init \
#     -backend-config="bucket=flowops-tfstate-123456789012" \
#     -backend-config="dynamodb_table=flowops-terraform-locks"
