import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const N1_ROUTE_COORDINATES = [
  { lat: -26.2041, lng: 28.0473 }, // Johannesburg Start
  { lat: -26.6761, lng: 27.9304 }, // Vanderbijlpark Crossing
  { lat: -28.2324, lng: 27.0848 }, // Ventersburg Stop
  { lat: -29.1181, lng: 26.2243 }, // Bloemfontein Logistics Hub
  { lat: -30.5964, lng: 25.0211 }, // Colesberg Toll Stop
  { lat: -32.2912, lng: 22.5834 }, // Beaufort West Linehaul Point
  { lat: -33.6421, lng: 19.4478 }, // Worcester Transit Tunnel
  { lat: -33.9249, lng: 18.4241 }, // Cape Town Final Port Terminal
];

async function runDirectDbSimulation() {
  console.log('🔄 Initializing Direct Database Telemetry Injection Pass...');
  
  try {
    // Dynamically look up Sipho by his phone number to prevent incrementing ID shifts
    const targetDriver = await prisma.driver.findFirst({
      where: { phone: '+27830000001' }
    });

    if (!targetDriver) {
      console.error('❌ Error: Driver profile "Sipho Ndlovu" with phone +27830000001 not found. Please run the seed script first.');
      process.exit(1);
    }

    console.log(`🎯 Located Active Resource: ${targetDriver.name} [ID: ${targetDriver.id}]`);

    for (let index = 0; index < N1_ROUTE_COORDINATES.length; index++) {
      const position = N1_ROUTE_COORDINATES[index];
      
      console.log(`🛰️ Writing Position Packet [Waypoint ${index + 1}/${N1_ROUTE_COORDINATES.length}] -> Lat: ${position.lat}, Lng: ${position.lng}`);
      
      // Update coordinates directly inside PostgreSQL
      await prisma.driver.update({
        where: { id: targetDriver.id },
        data: {
          lat: position.lat,
          lng: position.lng,
          availabilityStatus: 'AVAILABLE'
        }
      });

      // Update the linked waybill to IN_TRANSIT on the first waypoint move
      if (index === 1) {
        await prisma.waybill.updateMany({
          where: { companyId: 1, waybillNumber: 'WB-GTR-ZA-001' },
          data: { status: 'IN_TRANSIT' }
        });
        console.log('🚚 Waybill state automatically advanced to: IN_TRANSIT');
      }

      // Wait 2 seconds between waypoints so the frontend polling loop hooks capture the long-haul transit
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log('🎉 DIRECT TRANSIT DATA PASS 100% COMPLETE.');
  } catch (error) {
    console.error('❌ Data entry update failure:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runDirectDbSimulation();

