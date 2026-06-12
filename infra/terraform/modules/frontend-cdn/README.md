# `modules/frontend-cdn` — Frontend SPA hosting on S3 + CloudFront

Provisions:

- A **private S3 bucket** for the SPA bundle. Public access blocked, encrypted at rest.
- A **CloudFront distribution** in front of the bucket with **Origin Access Control** (OAC — modern replacement for OAI).
- A **bucket policy** scoping read access to that exact distribution only.
- **SPA routing**: 403/404 from S3 → 200 `/index.html` so deep links work.
- **Cache policies**: long TTL on `/assets/*` (Vite hashes them); short TTL on `/index.html`, `/sw.js`, `/manifest.json` so deploys propagate fast.
- **Optional custom domain** (set `domain_name`): adds Route 53 alias records pointing at the distribution. Requires an ACM cert in us-east-1.

## Usage

```hcl
module "frontend_cdn" {
  source = "../../modules/frontend-cdn"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  environment = "staging"

  domain_name         = "app-staging.flowops.example"  # optional
  hosted_zone_id      = "Z01234567890ABCDEFGHI"        # required if domain_name set
  acm_certificate_arn = "arn:aws:acm:us-east-1:..."     # required if domain_name set
}
```

## Outputs

- `bucket_name` — pass to CI's `aws s3 sync dist/ s3://<name>/`
- `distribution_id` — pass to `aws cloudfront create-invalidation --distribution-id <id> --paths '/*'`
- `distribution_domain_name` — the *.cloudfront.net hostname
- `bucket_arn`, `distribution_arn`, `url`

## Deploy workflow

```bash
cd frontend && npm ci && npm run build

# Hashed assets — long, immutable cache.
aws s3 sync dist/ s3://$(terraform output -raw bucket_name)/ \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" --exclude "sw.js" --exclude "manifest.json"

# Index + SW — never cache.
aws s3 cp dist/index.html s3://$(terraform output -raw bucket_name)/index.html \
  --cache-control "no-cache,no-store,must-revalidate"
aws s3 cp dist/sw.js s3://$(terraform output -raw bucket_name)/sw.js \
  --cache-control "no-cache,no-store,must-revalidate"
aws s3 cp dist/manifest.json s3://$(terraform output -raw bucket_name)/manifest.json \
  --cache-control "public,max-age=600"

aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw distribution_id) \
  --paths "/index.html" "/sw.js" "/manifest.json"
```

## Why CloudFront + S3 (not nginx in ECS)?

- ~10× cheaper for SPA traffic (~$1-5/month vs ~$15-30/month for ECS).
- Edge-cached globally without extra config.
- No autoscaling concerns.
- The `frontend/Dockerfile` is still useful — for local dev, CI smoke testing, and as a fallback for a same-origin nginx proxy in front of the API.
