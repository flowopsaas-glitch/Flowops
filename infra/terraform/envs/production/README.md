# Production environment

Same shape as `envs/staging/`. See `../staging/README.md` for the workflow.

## Differences from staging

- State key: `envs/production/terraform.tfstate`.
- CloudFront price class: `PriceClass_All` recommended (global edge).
- Custom domain expected (don't ship production on *.cloudfront.net).
- All module calls (network, backend-ecs, database, cache, secrets) wired here once the corresponding modules are filled in.

## Apply checklist (when going live)

- [ ] Bootstrap stack applied in this account.
- [ ] `terraform.tfvars` populated with real values.
- [ ] Custom domain DNS verified.
- [ ] ACM cert in us-east-1 issued and covering the domain.
- [ ] `terraform plan` reviewed by a second engineer.
- [ ] Rollback plan documented (see `docs/DEPLOYMENT.md` §"Rollback plan").
