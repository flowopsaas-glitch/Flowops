#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pre-flight guard for plan-entitlement enforcement (PR #140).
 *
 * Enforcement only blocks NEW creates beyond a plan's limit — it never touches
 * existing records. But a tenant ALREADY over a limit will start getting 403s
 * on their next create. This script reports any such tenant BEFORE you flip
 * enforcement live, so there are no surprises.
 *
 * It mirrors BillingService exactly:
 *   - trial-aware "effective plan" (active 14-day trial → Professional limits)
 *   - counts active drivers/users, branches, and waybills created this month
 *
 * Source of truth: reuses backend/dist/billing/plan-entitlements.js when the
 * backend has been built; otherwise falls back to a baked-in copy (and says so).
 *
 * Exit codes: 0 = all clear · 2 = one or more overages found · 1 = error.
 */

const fs = require('fs');
const path = require('path');

// Where the built backend lives. Defaults to the dev-box layout (<repo>/backend);
// override with BACKEND_DIR=/app when running inside the Compose api container.
const BACKEND_DIR = process.env.BACKEND_DIR || path.resolve(__dirname, '..', 'backend');

// ── Load DATABASE_URL from backend/.env if not already in the environment ──
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  try {
    const env = fs.readFileSync(path.join(BACKEND_DIR, '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    if (m) process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* no .env — Prisma will surface the missing-URL error */
  }
}

// ── Resolve the plan entitlements (prefer the built source of truth) ──
function loadEntitlements() {
  const distPath = path.join(BACKEND_DIR, 'dist', 'billing', 'plan-entitlements.js');
  try {
    const mod = require(distPath);
    if (mod && mod.PLAN_ENTITLEMENTS && mod.normalizePlan) {
      return { ...mod, source: 'backend/dist (live source of truth)' };
    }
  } catch {
    /* not built yet — fall through to baked-in copy */
  }
  // Fallback — keep in sync with backend/src/billing/plan-entitlements.ts
  const PLAN_ENTITLEMENTS = {
    starter: { name: 'Starter', limits: { waybillsPerMonth: 100, drivers: 3, users: 3, branches: 1 } },
    professional: { name: 'Professional', limits: { waybillsPerMonth: -1, drivers: 25, users: 50, branches: -1 } },
    enterprise: { name: 'Enterprise', limits: { waybillsPerMonth: -1, drivers: -1, users: -1, branches: -1 } },
  };
  const normalizePlan = (p) => {
    const v = String(p || 'starter').toLowerCase();
    return v === 'professional' || v === 'enterprise' ? v : 'starter';
  };
  return { PLAN_ENTITLEMENTS, normalizePlan, source: 'baked-in fallback (build the backend for the live values)' };
}

function effectivePlan(normalizePlan, plan, trialEndsAt) {
  const onTrial = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
  if (onTrial) {
    const base = normalizePlan(plan);
    return base === 'enterprise' ? 'enterprise' : 'professional';
  }
  return normalizePlan(plan);
}

async function main() {
  loadDatabaseUrl();

  let PrismaClient;
  try {
    ({ PrismaClient } = require(path.join(BACKEND_DIR, 'node_modules', '@prisma', 'client')));
  } catch (e) {
    console.error('Could not load @prisma/client from backend/node_modules. Run this after the backend deps are installed.');
    console.error(String(e.message || e));
    process.exit(1);
  }

  const { PLAN_ENTITLEMENTS, normalizePlan, source } = loadEntitlements();
  const prisma = new PrismaClient();

  console.log('');
  console.log('── Plan-limit pre-flight ───────────────────────────────────────');
  console.log(`   limits source: ${source}`);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const overages = [];

  try {
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, plan: true, trialEndsAt: true, isActive: true },
    });

    for (const c of companies) {
      const eff = effectivePlan(normalizePlan, c.plan, c.trialEndsAt);
      const limits = PLAN_ENTITLEMENTS[eff].limits;

      const [waybills, drivers, users, branches] = await Promise.all([
        prisma.waybill.count({ where: { companyId: c.id, createdAt: { gte: monthStart } } }),
        prisma.driver.count({ where: { companyId: c.id, isActive: true } }),
        prisma.user.count({ where: { companyId: c.id, isActive: true } }),
        prisma.branch.count({ where: { companyId: c.id } }),
      ]);

      const checks = [
        ['waybills this month', waybills, limits.waybillsPerMonth],
        ['active drivers', drivers, limits.drivers],
        ['active users', users, limits.users],
        ['branches', branches, limits.branches],
      ];

      const hit = checks.filter(([, used, limit]) => limit !== -1 && used > limit);
      if (hit.length) {
        overages.push({ company: c, eff, hit, active: c.isActive });
      }
    }

    console.log(`   tenants scanned: ${companies.length}`);

    if (overages.length === 0) {
      console.log('   ✅ No tenant is over its plan limit. Safe to enable enforcement.');
      console.log('────────────────────────────────────────────────────────────────');
      console.log('');
      await prisma.$disconnect();
      process.exit(0);
    }

    console.log('');
    console.log(`   ⚠️  ${overages.length} tenant(s) currently OVER limit — they will get 403s on their NEXT create:`);
    for (const o of overages) {
      const tag = o.active ? '' : ' (inactive)';
      console.log(`\n   • ${o.company.name}${tag}  [plan: ${o.eff}]  id=${o.company.id.slice(-8)}`);
      for (const [label, used, limit] of o.hit) {
        console.log(`       - ${label}: ${used} / ${limit}`);
      }
    }
    console.log('');
    console.log('   Options: bump these tenants to a higher plan, raise the limits in');
    console.log('   backend/src/billing/plan-entitlements.ts, or accept that new creates');
    console.log('   for the listed resources will be blocked until they upgrade.');
    console.log('────────────────────────────────────────────────────────────────');
    console.log('');
    await prisma.$disconnect();
    process.exit(2);
  } catch (e) {
    console.error('   Pre-flight query failed:', String(e.message || e));
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
