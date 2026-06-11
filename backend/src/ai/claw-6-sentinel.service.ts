import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BroadcastGateway } from '../broadcast/broadcast.gateway';

@Injectable()
export class Claw6SentinelService {
  private readonly logger = new Logger('CLAW_6_SENTINEL');

  constructor(
    private readonly jwtService: JwtService,
    private readonly gateway: BroadcastGateway,
  ) {}

  /**
   * Called by your AuthInterceptor or a Cron job 
   * to check if the user's session is nearing expiration.
   */
  async validateSessionIntegrity(token: string, userId: string) {
    try {
      const decoded = this.jwtService.decode(token) as any;
      const expiresAt = decoded.exp * 1000;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (expiresAt - now < fiveMinutes) {
        this.logger.warn(`Critically low session TTL for User ${userId}. Triggering refresh hint.`);
        
        // Emit a specific event to the frontend to trigger a silent refresh
        this.gateway.server.to(`user_${userId}`).emit('session-refresh-hint', {
          reason: 'preemptive_renewal',
        });
        
        return false; // Signal that refresh is needed
      }
      return true;
    } catch (err) {
      this.logger.error(`Sentinel detected compromised or invalid token for User ${userId}`);
      return false;
    }
  }
}
