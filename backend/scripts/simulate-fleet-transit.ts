import { io } from 'socket.io-client';

// Target the explicit exposed base container interface URL
const SOCKET_SERVER_URL = 'http://127.0.0';

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

async function beginFleetSimulation() {
  console.log('📡 Establishing secure telemetry client connection link to WebSocket cluster...');
  
  // Inject the global API prefix path parameter directly into the connection handshake options
  const telemetrySocket = io(SOCKET_SERVER_URL, {
    path: '/api/socket.io', // 🚀 THE FIX: Routes the WebSocket handshake through your app's /api prefix
    transports: ['websocket'],
    rejectUnauthorized: false
  });

  telemetrySocket.on('connect', async () => {
    console.log('✅ Telemetry simulation client actively authenticated.');
    
    const telemetryPayloadTemplate = {
      driverId: 1,  // Sipho Ndlovu (Created in your success seed pass)
      companyId: 1, // FlowOps ZA Logistics Hub
    };

    for (let index = 0; index < N1_ROUTE_COORDINATES.length; index++) {
      const position = N1_ROUTE_COORDINATES[index];
      
      console.log(`🛰️ Dispatching update packet [Waypoint ${index + 1}/${N1_ROUTE_COORDINATES.length}] -> Lat: ${position.lat}, Lng: ${position.lng}`);
      
      telemetrySocket.emit('updateDriverTelemetry', {
        ...telemetryPayloadTemplate,
        lat: position.lat,
        lng: position.lng,
      });

      // Pause for 2 seconds between waypoint broadcasts to allow smooth updates
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log('🎉 N1 LONG-HAUL SIMULATION COMPLETE. Disconnecting stream.');
    telemetrySocket.disconnect();
    process.exit(0);
  });

  telemetrySocket.on('connect_error', (error) => {
    console.error('❌ Telemetry Gateway Socket Connection Failure:', error.message);
    console.log('💡 Tip: If this fails, checking "docker logs flowops-backend" will reveal the application path.');
    process.exit(1);
  });
}

beginFleetSimulation();

