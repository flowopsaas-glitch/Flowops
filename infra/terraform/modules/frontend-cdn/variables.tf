variable "environment" {
  description = "Environment name (staging | production). Appears in tags and the bucket suffix."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "bucket_name" {
  description = "Override the S3 bucket name. Default: `flowops-frontend-<environment>-<account-id>`. Must be globally unique."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Custom domain to serve the SPA from (e.g. 'app-staging.flowops.example'). Empty disables custom-domain wiring; the distribution's *.cloudfront.net hostname is used instead."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for the custom domain. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate in us-east-1 covering domain_name. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 = US/Canada/Europe (cheapest). PriceClass_200 adds Asia/Africa/SA. PriceClass_All = global."
  type        = string
  default     = "PriceClass_100"
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be one of PriceClass_100, PriceClass_200, PriceClass_All."
  }
}

variable "default_ttl_seconds" {
  description = "Default TTL for cached content (seconds). Hashed assets in /assets/* override this with a longer TTL."
  type        = number
  default     = 86400
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
