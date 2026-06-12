variable "aws_region" {
  description = "AWS region this env's resources live in."
  type        = string
  default     = "us-east-1"
}

variable "frontend_domain_name" {
  description = "Custom domain the SPA is served at. Production should NOT run on the default cloudfront.net hostname."
  type        = string
}

variable "frontend_hosted_zone_id" {
  description = "Route 53 hosted zone ID for frontend_domain_name."
  type        = string
}

variable "frontend_acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) covering frontend_domain_name."
  type        = string
}

variable "frontend_price_class" {
  description = "CloudFront price class. PriceClass_All recommended for production (global edge)."
  type        = string
  default     = "PriceClass_All"
}
