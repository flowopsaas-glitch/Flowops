output "frontend_url" {
  description = "Public URL of the SPA."
  value       = module.frontend_cdn.url
}

output "frontend_bucket_name" {
  description = "S3 bucket the CI deploy step uploads dist/ to."
  value       = module.frontend_cdn.bucket_name
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID for cache invalidations."
  value       = module.frontend_cdn.distribution_id
}
