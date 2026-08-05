# FlowOps Industry Verticals (Enterprise Editions) — Requirements

## Introduction

FlowOps today has **two** configuration dimensions:

1. **Plan tier** (`backend/src/billing/plan-entitlements.ts`) — `starter | professional |
   enterprise` → commercial feature flags (what a tenant may use).
2. **Role / department permissions** (`frontend/src/lib/tenantUserPermissions.ts`) —
   per-user nav + route access (what a person may see).

The product currently presents **one generic experience** ("Logistics Control Hub")
regardless of what kind of business the tenant is. An import/export forwarder, a
retail distributor, and a pharmacy cold-chain operator have very different
departments, dashboards, terminology, and compliance needs — yet they all see the
same courier-centric shell.

This spec introduces a **third dimension: Industry Vertical** — turning Enterprise
into a set of **industry editions**, each with a tailored department layout,
dashboard/control-tower, terminology, and module emphasis, while reusing the same
underlying platform and commercial tiers.

> Goal: a tenant picks (or is assigned) their industry, and FlowOps reshapes itself
> into the right operations system for *that* industry — without forking the product.

## Target industries (initial set)

| # | Vertical | Representative customers | Status of underlying modules |
|---|---|---|---|
| V1 | **Import/Export & Freight Forwarding** | Clearing & forwarding agents | Strong (forwarding, customs/SARS EDI, control tower) |
| V2 | **Courier & Parcel (last-mile)** | Courier networks | Strong (current core) |
| V3 | **Retail Distribution & Replenishment** | Shoprite, Woolworths, Pick n Pay | Partial — needs DC/store replenishment, advanced WMS |
| V4 | **Pharma & Cold Chain** | Dischem, Clicks, healthcare distributors | Gap — needs temp logging, batch/lot, recalls, SAHPRA |
| V5 | **3PL / Contract Logistics** | Multi-client warehousing + transport | Partial — needs multi-client billing/segregation |
| V6 | **Manufacturing & Distribution** | FMCG producers | Later |

V1 + V2 are the **reference verticals** (built from existing modules). V3–V6 are
incremental.

## Requirements

### Requirement 1 — Industry as a first-class tenant attribute
**User story:** As a platform owner, I want each tenant tagged with its industry, so
the product can present the right departments and dashboard for that business.

#### Acceptance criteria
1. WHEN a company is created or edited THEN it SHALL carry an `industry` value from a
   defined enum (defaulting to `COURIER` for backwards compatibility).
2. WHEN no industry is set on an existing tenant THEN the system SHALL behave exactly
   as today (no regression).
3. The owner console SHALL allow viewing and changing a tenant's industry.

### Requirement 2 — Industry Packs drive the experience
**User story:** As a tenant user, I want the navigation, dashboard, and terminology to
match my industry, so the platform feels purpose-built.

#### Acceptance criteria
1. The system SHALL define an **Industry Pack** per vertical: enabled/emphasised
   modules, default dashboard/control-tower, nav section layout + labels, and
   terminology overrides.
2. WHEN a user loads the app THEN nav + dashboard SHALL be resolved from
   `industry pack ∩ plan entitlements ∩ user permissions` (all three must allow).
3. An Industry Pack SHALL NOT grant a feature the tenant's plan doesn't entitle — the
   pack only **selects and arranges** within the entitled set (plus industry-specific
   modules that ship with the pack).

### Requirement 3 — Industry-specific dashboards
**User story:** As an operator, I want a control tower built for my industry, so my
first screen drives my real decisions.

#### Acceptance criteria
1. Each vertical SHALL have a dedicated control-tower view (e.g. Freight Control Tower
   for V1, Retail Distribution Tower for V3, Cold Chain Tower for V4).
2. The dashboard SHALL select the control tower from the tenant's industry pack,
   falling back to the current generic view when unset.
3. Empty states SHALL be industry-specific and instructional (per the dashboard audit).

### Requirement 4 — Terminology & branding per industry
**User story:** As a user, I want the system to use my industry's language.

#### Acceptance criteria
1. The system SHALL support per-industry terminology overrides (e.g. "Shipment File"
   vs "Store Order" vs "Consignment"; "Consignee" vs "Store").
2. Terminology SHALL be centralised so a label changes everywhere at once.

### Requirement 5 — Compliance posture per industry
**User story:** As a compliance owner, I want regulated verticals to carry their own
controls, so we never present a regulated capability we don't actually have.

#### Acceptance criteria
1. Regulated packs (e.g. Pharma/Cold Chain) SHALL declare their compliance
   requirements (temperature logging, batch/lot, recall workflow, SAHPRA) explicitly.
2. WHERE a regulated capability is not implemented THEN the pack SHALL NOT advertise it
   as available (honest-capability rule).

### Requirement 6 — No regression & gradual rollout
**User story:** As the team, I want to ship this incrementally without breaking the
existing single-experience tenants.

#### Acceptance criteria
1. The default industry (`COURIER`) SHALL reproduce today's experience exactly.
2. Verticals SHALL be shippable one at a time behind the industry attribute.
3. Scale/enterprise-readiness hardening (queues, caching, read replicas, load testing)
   SHALL be tracked alongside, since industry editions target larger tenants.

## Out of scope (this spec)
- Full ERP/WMS replacement for tier-1 retailers (FlowOps serves a logistics scope /
  division / 3PL beachhead — see the enterprise-readiness notes in tasks.md).
- Per-industry billing/pricing changes (the commercial tiers stay; industry is
  orthogonal). Pricing packaging is a separate commercial decision.
