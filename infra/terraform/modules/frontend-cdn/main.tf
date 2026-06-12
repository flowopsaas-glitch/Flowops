data "aws_caller_identity" "current" {}

locals {
  bucket_name = (
    var.bucket_name != ""
    ? var.bucket_name
    : "flowops-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  )

  use_custom_domain = var.domain_name != ""

  common_tags = merge(
    {
      Project     = "FlowOps"
      Environment = var.environment
      Component   = "frontend-cdn"
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

# Cross-cutting validation that's awkward in `validation {}` blocks.
resource "terraform_data" "domain_validation" {
  lifecycle {
    precondition {
      condition = (
        var.domain_name == ""
        ||
        (var.hosted_zone_id != "" && var.acm_certificate_arn != "")
      )
      error_message = "If domain_name is set, both hosted_zone_id and acm_certificate_arn are required."
    }
  }
}

# ── S3: SPA bundle ────────────────────────────────────────────────────────

resource "aws_s3_bucket" "spa" {
  bucket = local.bucket_name
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "spa" {
  bucket = aws_s3_bucket.spa.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "spa" {
  bucket = aws_s3_bucket.spa.id
  versioning_configuration {
    # Off by default — SPA bundles are immutable per Vite hash; previous
    # deploys are still in CI artefacts. Turn on per-env if you need
    # rollback-by-version.
    status = "Suspended"
  }
}

# ── CloudFront: Origin Access Control ────────────────────────────────────

resource "aws_cloudfront_origin_access_control" "spa" {
  name                              = "${local.bucket_name}-oac"
  description                       = "OAC for FlowOps frontend (${var.environment})"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── CloudFront: cache policy + response-headers policy ───────────────────

# AWS-managed cache policy. Sensible defaults: respects Cache-Control from
# the origin, includes gzip/br variants in the cache key.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# Adds the same security headers the nginx container deploy adds (HSTS,
# CSP, X-Frame-Options, etc.) so the CloudFront-hosted SPA gets the same
# hardening.
resource "aws_cloudfront_response_headers_policy" "spa_security" {
  name = "flowops-frontend-${var.environment}-security-headers"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss: ws:; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'"
      override                = true
    }

    xss_protection {
      protection = false
      override   = true
    }
  }
}

# ── CloudFront: distribution ─────────────────────────────────────────────

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  comment             = "FlowOps frontend (${var.environment})"
  http_version        = "http2and3"

  aliases = local.use_custom_domain ? [var.domain_name] : []

  origin {
    domain_name              = aws_s3_bucket.spa.bucket_regional_domain_name
    origin_id                = "spa-bucket"
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id
  }

  # Default behaviour: short TTL — covers /index.html, /sw.js,
  # /manifest.json and any new files that haven't been given a more
  # specific behaviour yet.
  default_cache_behavior {
    target_origin_id       = "spa-bucket"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.spa_security.id

    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 300
  }

  # Hashed assets: long, immutable.
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = "spa-bucket"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.spa_security.id

    min_ttl     = 31536000
    default_ttl = 31536000
    max_ttl     = 31536000
  }

  # SPA fallback: deep links like /shipments/123 that don't have an
  # actual S3 object should serve /index.html so React Router can handle
  # them client-side. S3 returns 403 (not 404) for missing keys when the
  # bucket is private + OAC, so we map both to the SPA index.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.use_custom_domain
    acm_certificate_arn            = local.use_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : null
  }

  tags = local.common_tags
}

# ── Bucket policy: only this distribution can read ──────────────────────

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid    = "AllowCloudFrontRead"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.spa.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  policy = data.aws_iam_policy_document.bucket_policy.json

  depends_on = [aws_cloudfront_distribution.spa]
}

# ── Optional: Route 53 alias records for the custom domain ──────────────

resource "aws_route53_record" "spa_a" {
  count   = local.use_custom_domain ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "spa_aaaa" {
  count   = local.use_custom_domain ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
    evaluate_target_health = false
  }
}
