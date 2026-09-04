/**
 * FlowOps — Rail / Intermodal Demo Seed (for RASA demo)
 *
 * Populates the RailConsignment lifecycle across real SADC rail corridors so the
 * Rail & Intermodal Operations dashboard looks alive:
 *  - North-South / Copperbelt (copper, cobalt)
 *  - Coal Line (Mpumalanga → Richards Bay)
 *  - Manganese (Northern Cape → Gqeberha/Coega)
 *  - Maputo Corridor (magnetite / chrome → Maputo port)
 *  - Container intermodal (City Deep ICD ↔ Durban)
 *
 * Each consignment has wagons, intermodal legs (road↔rail↔port handoffs with
 * dwell hours) and an event timeline. Scoped to the 'FlowOps Demo Couriers'
 * tenant. Reuses the proven Prisma patterns: company:{connect}, UPPERCASE enums,
 * omit-if-unset, explicit dates.
 *
 * Usage (inside API container):
 *   docker cp backend/prisma/seed-demo-rail.js flowops-api-1:/app/prisma/seed-demo-rail.js
 *   docker exec -it flowops-api-1 node prisma/seed-demo-rail.js
 *
 * Safe to re-run: clears existing rail demo data for the tenant first.
 */

'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function hoursAgo(n) { const d = new Date(); d.setHours(d.getHours() - n); return d; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function wagonNo(prefix, n) { return `${prefix}-${String(n).padStart(6, '0')}`; }

// ── Consignment blueprints across real SADC rail corridors ──────────────────
const CONSIGNMENTS = [
  {
    commodity: 'Copper Cathodes', clientName: 'Kamoa Copper', corridor: 'North-South / Copperbelt',
    originSiding: 'Lubumbashi Terminal (DRC)', destinationSiding: 'Durban Container Terminal',
    railOperator: 'Grindrod / TFR', serviceRef: 'NS-CU-4471', interchangePoint: 'Kasumbalesa Interchange',
    tonnage: 2400, wagonsPlanned: 40, wagonType: 'CONTAINER_CAR', wagonPrefix: 'DRC',
    status: 'IN_TRANSIT', risk: 'HIGH', slaHours: 168, departedDaysAgo: 4, plannedArrivalDaysFromNow: 2,
    legs: [
      { mode: 'ROAD', from: 'Kamoa-Kakula Mine', to: 'Lubumbashi Terminal', status: 'COMPLETED', dwell: 6 },
      { mode: 'RAIL', from: 'Lubumbashi Terminal', to: 'Kasumbalesa Interchange', status: 'IN_PROGRESS' },
      { mode: 'RAIL', from: 'Kasumbalesa Interchange', to: 'Durban Container Terminal', status: 'PENDING' },
      { mode: 'PORT', from: 'Durban Container Terminal', to: 'Vessel', status: 'PENDING' },
    ],
  },
  {
    commodity: 'Export Coal', clientName: 'Seriti Resources', corridor: 'Coal Line',
    originSiding: 'eMalahleni Siding (Mpumalanga)', destinationSiding: 'Richards Bay Coal Terminal',
    railOperator: 'Transnet Freight Rail', serviceRef: 'CL-COAL-2209', interchangePoint: 'Ermelo Yard',
    tonnage: 8400, wagonsPlanned: 100, wagonType: 'GONDOLA', wagonPrefix: 'CCR',
    status: 'ARRIVED', risk: 'LOW', slaHours: 36, departedDaysAgo: 2, plannedArrivalDaysFromNow: -1, arrivedDaysAgo: 0,
    legs: [
      { mode: 'RAIL', from: 'eMalahleni Siding', to: 'Ermelo Yard', status: 'COMPLETED', dwell: 3.5 },
      { mode: 'RAIL', from: 'Ermelo Yard', to: 'Richards Bay Coal Terminal', status: 'COMPLETED', dwell: 2 },
      { mode: 'PORT', from: 'Richards Bay Coal Terminal', to: 'Vessel', status: 'IN_PROGRESS' },
    ],
  },
  {
    commodity: 'Manganese Ore', clientName: 'South32 Hotazel', corridor: 'Manganese Line',
    originSiding: 'Hotazel (Northern Cape)', destinationSiding: 'Port of Coega (Gqeberha)',
    railOperator: 'Transnet Freight Rail', serviceRef: 'MN-ORE-1180', interchangePoint: 'De Aar Junction',
    tonnage: 6000, wagonsPlanned: 84, wagonType: 'GONDOLA', wagonPrefix: 'MNR',
    status: 'AT_INTERCHANGE', risk: 'MEDIUM', slaHours: 60, departedDaysAgo: 2, plannedArrivalDaysFromNow: 1,
    legs: [
      { mode: 'RAIL', from: 'Hotazel', to: 'De Aar Junction', status: 'COMPLETED', dwell: 5 },
      { mode: 'RAIL', from: 'De Aar Junction', to: 'Port of Coega', status: 'PENDING' },
      { mode: 'PORT', from: 'Port of Coega', to: 'Vessel', status: 'PENDING' },
    ],
  },
  {
    commodity: 'Chrome Concentrate', clientName: 'Samancor Chrome', corridor: 'Maputo Corridor',
    originSiding: 'Steelpoort Siding (Limpopo)', destinationSiding: 'Port of Maputo (Mozambique)',
    railOperator: 'TFR / CFM', serviceRef: 'MPC-CR-3320', interchangePoint: 'Ressano Garcia Border',
    tonnage: 3200, wagonsPlanned: 48, wagonType: 'GONDOLA', wagonPrefix: 'CHR',
    status: 'DEPARTED', risk: 'MEDIUM', slaHours: 72, departedDaysAgo: 1, plannedArrivalDaysFromNow: 2,
    legs: [
      { mode: 'ROAD', from: 'Steelpoort Mine', to: 'Steelpoort Siding', status: 'COMPLETED', dwell: 4 },
      { mode: 'RAIL', from: 'Steelpoort Siding', to: 'Ressano Garcia Border', status: 'IN_PROGRESS' },
      { mode: 'RAIL', from: 'Ressano Garcia Border', to: 'Port of Maputo', status: 'PENDING' },
    ],
  },
  {
    commodity: 'Containers (Import)', clientName: 'DP World Logistics', corridor: 'Natcor (Durban–Gauteng)',
    originSiding: 'Durban Container Terminal', destinationSiding: 'City Deep ICD (Johannesburg)',
    railOperator: 'Transnet Freight Rail', serviceRef: 'NATCOR-CT-7781', interchangePoint: 'Cato Ridge Yard',
    tonnage: 1800, wagonsPlanned: 30, wagonType: 'CONTAINER_CAR', wagonPrefix: 'CTR',
    status: 'WAGONS_ALLOCATED', risk: 'LOW', slaHours: 30, plannedDepartureDaysFromNow: 1, plannedArrivalDaysFromNow: 2,
    legs: [
      { mode: 'PORT', from: 'Durban Container Terminal', to: 'Rail Siding', status: 'PENDING' },
      { mode: 'RAIL', from: 'Durban Container Terminal', to: 'City Deep ICD', status: 'PENDING' },
      { mode: 'ROAD', from: 'City Deep ICD', to: 'Consignee DC', status: 'PENDING' },
    ],
  },
  {
    commodity: 'Cobalt Hydroxide', clientName: 'Trafigura', corridor: 'North-South / Copperbelt',
    originSiding: 'Kolwezi Load Point (DRC)', destinationSiding: 'Durban Container Terminal',
    railOperator: 'Grindrod / TFR', serviceRef: 'NS-CO-4402', interchangePoint: 'Beitbridge Interchange',
    tonnage: 1500, wagonsPlanned: 25, wagonType: 'CONTAINER_CAR', wagonPrefix: 'COB',
    status: 'COMPLETED', risk: 'LOW', slaHours: 180, departedDaysAgo: 9, plannedArrivalDaysFromNow: -2, arrivedDaysAgo: 2,
    legs: [
      { mode: 'ROAD', from: 'Kolwezi Mine', to: 'Kolwezi Load Point', status: 'COMPLETED', dwell: 8 },
      { mode: 'RAIL', from: 'Kolwezi Load Point', to: 'Beitbridge Interchange', status: 'COMPLETED', dwell: 14 },
      { mode: 'RAIL', from: 'Beitbridge Interchange', to: 'Durban Container Terminal', status: 'COMPLETED', dwell: 4 },
      { mode: 'PORT', from: 'Durban Container Terminal', to: 'Vessel', status: 'COMPLETED', dwell: 6 },
    ],
  },
  {
    commodity: 'Magnetite', clientName: 'Palabora Mining', corridor: 'Maputo Corridor',
    originSiding: 'Phalaborwa Siding', destinationSiding: 'Port of Maputo (Mozambique)',
    railOperator: 'TFR / CFM', serviceRef: 'MPC-MG-3345', interchangePoint: 'Ressano Garcia Border',
    tonnage: 4200, wagonsPlanned: 60, wagonType: 'HOPPER', wagonPrefix: 'MAG',
    status: 'PLANNED', risk: 'LOW', slaHours: 72, plannedDepartureDaysFromNow: 3, plannedArrivalDaysFromNow: 6,
    legs: [
      { mode: 'RAIL', from: 'Phalaborwa Siding', to: 'Ressano Garcia Border', status: 'PENDING' },
      { mode: 'RAIL', from: 'Ressano Garcia Border', to: 'Port of Maputo', status: 'PENDING' },
    ],
  },
  {
    commodity: 'Fuel (Diesel)', clientName: 'Reef Tankers', corridor: 'Natcor (Durban–Gauteng)',
    originSiding: 'Island View (Durban)', destinationSiding: 'Alrode Depot (Gauteng)',
    railOperator: 'Transnet Freight Rail', serviceRef: 'NATCOR-FL-7802', interchangePoint: 'Cato Ridge Yard',
    tonnage: 2000, wagonsPlanned: 28, wagonType: 'TANK', wagonPrefix: 'TNK',
    status: 'OFFLOADED', risk: 'MEDIUM', slaHours: 30, departedDaysAgo: 2, plannedArrivalDaysFromNow: -1, arrivedDaysAgo: 1,
    legs: [
      { mode: 'PORT', from: 'Island View', to: 'Rail Siding', status: 'COMPLETED', dwell: 5 },
      { mode: 'RAIL', from: 'Island View', to: 'Alrode Depot', status: 'COMPLETED', dwell: 3 },
      { mode: 'ROAD', from: 'Alrode Depot', to: 'Client Bulk Store', status: 'COMPLETED', dwell: 2 },
    ],
  },
];

async function main() {
  console.log('\n=== FlowOps Rail / Intermodal Demo Seed (RASA) ===\n');

  const company = await prisma.company.findFirst({ where: { name: 'FlowOps Demo Couriers' } });
  if (!company) {
    console.log('ERROR: Run seed-demo-company.js first!');
    process.exit(1);
  }
  const cid = company.id;
  console.log(`Company: ${company.name} (${cid})`);

  // ── Clear existing rail demo data (children first) ──────────────────────────
  console.log('\nClearing existing rail demo data...');
  await prisma.railConsignmentEvent.deleteMany({ where: { consignment: { companyId: cid } } });
  await prisma.intermodalLeg.deleteMany({ where: { consignment: { companyId: cid } } });
  await prisma.wagon.deleteMany({ where: { consignment: { companyId: cid } } });
  await prisma.railConsignment.deleteMany({ where: { companyId: cid } });
  console.log('  Cleared.\n');

  const year = new Date().getFullYear();
  let seq = 0;

  for (const c of CONSIGNMENTS) {
    seq += 1;
    const consignmentNumber = `RAIL-${year}-${String(seq).padStart(5, '0')}`;

    const data = {
      company: { connect: { id: cid } },
      consignmentNumber,
      status: c.status,
      commodity: c.commodity,
      clientName: c.clientName,
      tonnage: c.tonnage,
      wagonsPlanned: c.wagonsPlanned,
      corridor: c.corridor,
      originSiding: c.originSiding,
      destinationSiding: c.destinationSiding,
      railOperator: c.railOperator,
      serviceRef: c.serviceRef,
      interchangePoint: c.interchangePoint,
      slaHours: c.slaHours,
      createdAt: daysAgo(c.departedDaysAgo != null ? c.departedDaysAgo + 1 : 2),
      updatedAt: new Date(),
    };
    if (c.risk) data.riskLevel = c.risk;
    if (c.departedDaysAgo != null) data.actualDeparture = daysAgo(c.departedDaysAgo);
    if (c.arrivedDaysAgo != null) data.actualArrival = daysAgo(c.arrivedDaysAgo);
    if (c.plannedDepartureDaysFromNow != null) data.plannedDeparture = daysFromNow(c.plannedDepartureDaysFromNow);
    else if (c.departedDaysAgo != null) data.plannedDeparture = daysAgo(c.departedDaysAgo);
    if (c.plannedArrivalDaysFromNow != null) data.plannedArrival = daysFromNow(c.plannedArrivalDaysFromNow);

    const consignment = await prisma.railConsignment.create({ data });

    // ── Wagons (sample of the rake — enough to look real, not all 100) ────────
    const wagonSample = Math.min(c.wagonsPlanned, 12);
    const perWagon = c.tonnage / c.wagonsPlanned;
    for (let i = 1; i <= wagonSample; i++) {
      await prisma.wagon.create({
        data: {
          consignment: { connect: { id: consignment.id } },
          wagonNumber: wagonNo(c.wagonPrefix, randInt(10000, 999999)),
          type: c.wagonType,
          tareTonnes: c.wagonType === 'TANK' ? 22 : c.wagonType === 'CONTAINER_CAR' ? 20 : 26,
          loadedTonnes: Math.round(perWagon * 10) / 10,
          commodity: c.commodity,
          lastKnownSiding:
            c.status === 'IN_TRANSIT' ? c.interchangePoint
            : c.status === 'AT_INTERCHANGE' ? c.interchangePoint
            : ['ARRIVED', 'OFFLOADED', 'COMPLETED'].includes(c.status) ? c.destinationSiding
            : c.originSiding,
        },
      });
    }

    // ── Intermodal legs (with dwell where completed) ──────────────────────────
    let legSeq = 0;
    for (const leg of c.legs) {
      legSeq += 1;
      const legData = {
        consignment: { connect: { id: consignment.id } },
        sequence: legSeq,
        mode: leg.mode,
        status: leg.status,
        fromLocation: leg.from,
        toLocation: leg.to,
        handler: c.railOperator,
      };
      if (leg.dwell != null) {
        legData.dwellHours = leg.dwell;
        legData.actualStart = hoursAgo(leg.dwell + randInt(1, 6));
        legData.actualEnd = hoursAgo(randInt(1, 6));
      } else if (leg.status === 'IN_PROGRESS') {
        legData.actualStart = hoursAgo(randInt(2, 10));
      }
      await prisma.intermodalLeg.create({ data: legData });
    }

    // ── Event timeline (walk the lifecycle up to current status) ──────────────
    const LIFECYCLE = ['PLANNED', 'WAGONS_ALLOCATED', 'LOADING', 'DEPARTED', 'IN_TRANSIT', 'AT_INTERCHANGE', 'ARRIVED', 'OFFLOADED', 'COMPLETED'];
    const idx = LIFECYCLE.indexOf(c.status);
    const steps = idx >= 0 ? LIFECYCLE.slice(0, idx + 1) : ['PLANNED'];
    let t = steps.length + 2;
    for (const s of steps) {
      await prisma.railConsignmentEvent.create({
        data: {
          consignmentId: consignment.id,
          status: s,
          note: `${consignmentNumber} → ${s.replace(/_/g, ' ').toLowerCase()}`,
          location:
            s === 'AT_INTERCHANGE' ? c.interchangePoint
            : ['ARRIVED', 'OFFLOADED', 'COMPLETED'].includes(s) ? c.destinationSiding
            : c.originSiding,
          reachedAt: daysAgo(t),
        },
      });
      t = Math.max(0, t - 1);
    }

    console.log(`  ${consignmentNumber}  ${c.commodity.padEnd(20)} ${c.corridor.padEnd(28)} [${c.status}] ${wagonSample} wagons, ${c.legs.length} legs`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const [consignments, wagons, legs] = await Promise.all([
    prisma.railConsignment.count({ where: { companyId: cid } }),
    prisma.wagon.count({ where: { consignment: { companyId: cid } } }),
    prisma.intermodalLeg.count({ where: { consignment: { companyId: cid } } }),
  ]);
  const tonnage = CONSIGNMENTS.reduce((s, c) => s + c.tonnage, 0);

  console.log('\n' + '='.repeat(60));
  console.log('  RAIL DEMO READY — FlowOps Rail & Intermodal Operations');
  console.log('='.repeat(60));
  console.log(`  Consignments   ${consignments}`);
  console.log(`  Wagons         ${wagons}`);
  console.log(`  Intermodal legs ${legs}`);
  console.log(`  Total tonnage  ${tonnage.toLocaleString()} t across 5 SADC corridors`);
  console.log('='.repeat(60));
  console.log('\n  View: app.flowop.work → OPS → Rail & Intermodal');
  console.log('  Login: admin@demo.flowops.local / Demo@Admin123!\n');
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
