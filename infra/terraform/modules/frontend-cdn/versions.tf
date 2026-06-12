terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
      # CloudFront ACM certificates MUST live in us-east-1.
      # Callers pass their own us-east-1-aliased provider via:
      #   providers = { aws.us_east_1 = aws.us_east_1 }
      configuration_aliases = [aws.us_east_1]
    }
  }
}
