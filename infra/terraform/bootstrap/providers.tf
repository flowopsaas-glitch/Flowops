provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "FlowOps"
      Environment = "shared"
      ManagedBy   = "terraform"
      Stack       = "bootstrap"
    }
  }
}
