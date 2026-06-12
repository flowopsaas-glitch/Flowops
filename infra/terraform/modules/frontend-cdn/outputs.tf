output "bucket_name" {
  description = "S3 bucket name. Pass to CI deploy: aws s3 sync dist/ s3://<bucket_name>/"
  value       = aws_s3_bucket.spa.id
}

output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = aws_s3_bucket.spa.arn
}

output "distribution_id" {
  description = "CloudFront distribution ID. Pass to CI deploy: aws cloudfront create-invalidation --distribution-id <id> ..."
  value       = aws_cloudfront_distribution.spa.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN."
  value       = aws_cloudfront_distribution.spa.arn
}

output "distribution_domain_name" {
  description = "Default *.cloudfront.net hostname."
  value       = aws_cloudfront_distribution.spa.domain_name
}

output "url" {
  description = "Public URL the SPA is served at — custom domain if configured, else the cloudfront.net hostname."
  value = (
    var.domain_name != ""
    ? "https://${var.domain_name}"
    : "https://${aws_cloudfront_distribution.spa.domain_name}"
  )
}
