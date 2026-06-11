import { Controller, Get } from '@nestjs/common';

@Controller() // Root level, no prefix
export class HealthController {
  @Get('health-debug')
  async healthDebug() {
    console.log("🚨🚨🚨 HEALTH_DEBUG_ENDPOINT_HIT 🚨🚨🚨");
    return {
      status: "ALIVE",
      timestamp: new Date().toISOString(),
      pid: process.pid,
      node: process.version,
      proof: "ROOT_ENDPOINT_WORKS"
    };
  }
}
