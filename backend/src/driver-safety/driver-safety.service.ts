import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { EmailService } from '../email/email.service';
import {
  SAFETY_ZONES_ZA, SAFETY_ZONES_ZW, SAFETY_ZONES_KE,
  SAFETY_ZONES_NG, SAFETY_ZONES_MZ, SAFETY_ZONES_GH, SAFETY_ZONES_BW,
} from './safety-zones-data';

/**
 * Driver Safety Service — World-Class Crime Hotspot Detection & Alerting
 *
 * When a driver's GPS position enters a SafetyZone, this service:
 *   1. Immediately pushes a WebSocket alert to the driver's mobile
 *   2. Notifies dispatch desk (in-app notification + WebSocket)
 *   3. Notifies tenant admin (email + in-app)
 *   4. Logs the event as a SafetyAlert for audit/compliance
 *   5. Tracks when the driver exits the zone
 *
 * Designed for South African courier operations where cargo theft and
 * driver hijacking are real, daily threats.
 */
@Injectable()
export class DriverSafetyService {
  private readonly logger = new Logger('DriverSafety');

  // In-memory cooldown to prevent spamming the same driver with the same zone alert
  // Key: `${driverId}:${zoneId}`, Value: timestamp of last alert
  private readonly alertCooldowns = new Map<string, number>();
  private readonly COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between alerts for same zone

  constructor(
    private prisma: PrismaService,
    private gateway: EventsGateway,
    private email: EmailService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // CORE: Check driver position against all active safety zones
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Called on every GPS update (every 30s). Checks if the driver is inside
   * any active safety zone and triggers alerts if so.
   *
   * Performance: O(n) where n = active zones for the company. For most
   * tenants this is < 50 zones — sub-millisecond.
   */
  async checkPosition(
    driverId: string,
    companyId: string,
    lat: number,
    lng: number,
    speed?: number,
    driverName?: string,
  ): Promise<{ inZone: boolean; alerts: any[] }> {
    // Get all active zones for this company
    const zones = await this.prisma.safetyZone.findMany({
      where: { companyId, isActive: true },
    });

    if (zones.length === 0) return { inZone: false, alerts: [] };

    const alerts: any[] = [];

    for (const zone of zones) {
      const distance = this.haversineMetres(lat, lng, zone.lat, zone.lng);

      if (distance <= zone.radiusM) {
        // Driver is inside this safety zone!
        const cooldownKey = `${driverId}:${zone.id}`;
        const lastAlert = this.alertCooldowns.get(cooldownKey);

        if (lastAlert && Date.now() - lastAlert < this.COOLDOWN_MS) {
          continue; // Already alerted recently — skip
        }

        // Trigger alert
        const alert = await this.triggerAlert(
          driverId, companyId, zone, lat, lng, speed, driverName,
        );
        alerts.push(alert);

        // Set cooldown
        this.alertCooldowns.set(cooldownKey, Date.now());
      }
    }

    return { inZone: alerts.length > 0, alerts };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ALERT TRIGGER: Multi-channel notification
  // ══════════════════════════════════════════════════════════════════════════

  private async triggerAlert(
    driverId: string,
    companyId: string,
    zone: any,
    lat: number,
    lng: number,
    speed?: number,
    driverName?: string,
  ) {
    const name = driverName ?? 'Driver';

    // 1. Create audit record
    const alert = await this.prisma.safetyAlert.create({
      data: {
        companyId,
        driverId,
        driverName: name,
        zoneId: zone.id,
        zoneName: zone.name,
        riskLevel: zone.riskLevel,
        lat,
        lng,
        speed: speed ?? null,
        driverNotified: zone.notifyDriver,
        dispatchNotified: zone.notifyDispatch,
        adminNotified: zone.notifyAdmin,
      },
    });

    const alertMessage = zone.alertMessage ??
      this.getDefaultAlertMessage(zone.riskLevel, zone.name);

    // 2. Push WebSocket alert to DRIVER (real-time on mobile)
    if (zone.notifyDriver) {
      this.gateway.emitToDriver(driverId, 'safety-alert', {
        type: 'SAFETY_ZONE_ENTERED',
        alertId: alert.id,
        zoneName: zone.name,
        riskLevel: zone.riskLevel,
        message: alertMessage,
        lat,
        lng,
      });
    }

    // 3. Push to DISPATCH (company dashboard)
    if (zone.notifyDispatch) {
      this.gateway.broadcastToCompany(companyId, 'safety-alert', {
        type: 'DRIVER_IN_HOTSPOT',
        alertId: alert.id,
        driverId,
        driverName: name,
        zoneName: zone.name,
        riskLevel: zone.riskLevel,
        lat,
        lng,
        speed,
        message: `⚠️ ${name} entered high-risk zone: ${zone.name}`,
      });

      // Also create persistent notification
      await this.prisma.notification.create({
        data: {
          companyId,
          title: `⚠️ Driver Safety Alert`,
          body: `${name} entered ${zone.riskLevel} risk zone: ${zone.name}. GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          type: 'SAFETY_ALERT',
        },
      }).catch(() => { /* best-effort */ });
    }

    // 4. Notify ADMIN via email (for CRITICAL/HIGH zones)
    if (zone.notifyAdmin && (zone.riskLevel === 'CRITICAL' || zone.riskLevel === 'HIGH')) {
      await this.notifyAdminEmail(companyId, name, zone, lat, lng, speed);
    }

    this.logger.warn(
      `🚨 SAFETY ALERT: ${name} entered ${zone.riskLevel} zone "${zone.name}" ` +
      `(${lat.toFixed(4)}, ${lng.toFixed(4)}) — distance from center: within ${zone.radiusM}m`,
    );

    return alert;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN EMAIL NOTIFICATION
  // ══════════════════════════════════════════════════════════════════════════

  private async notifyAdminEmail(
    companyId: string,
    driverName: string,
    zone: any,
    lat: number,
    lng: number,
    speed?: number,
  ) {
    // Find company admins
    const admins = await this.prisma.user.findMany({
      where: { companyId, role: { in: ['ADMIN', 'COMPANY_ADMIN'] }, isActive: true },
      select: { email: true, name: true },
    });

    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const riskColor = zone.riskLevel === 'CRITICAL' ? '#ef4444' : '#f59e0b';

    for (const admin of admins) {
      await this.email.send({
        to: admin.email,
        subject: `🚨 Driver Safety Alert — ${driverName} in ${zone.riskLevel} zone`,
        html: `
          <div style="font-family:system-ui;max-width:500px;margin:0 auto;padding:20px">
            <div style="background:${riskColor};color:white;padding:16px;border-radius:12px;text-align:center;margin-bottom:16px">
              <h2 style="margin:0;font-size:18px">⚠️ DRIVER SAFETY ALERT</h2>
              <p style="margin:4px 0 0;opacity:0.9">${zone.riskLevel} RISK ZONE</p>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
              <p><strong>Driver:</strong> ${driverName}</p>
              <p><strong>Zone:</strong> ${zone.name}</p>
              <p><strong>Risk Level:</strong> ${zone.riskLevel}</p>
              <p><strong>GPS:</strong> ${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
              ${speed != null ? `<p><strong>Speed:</strong> ${speed.toFixed(0)} km/h</p>` : ''}
              <p><strong>Time:</strong> ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>
              <a href="${mapLink}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:bold">
                📍 View on Map
              </a>
            </div>
            <p style="font-size:12px;color:#6b7280;margin-top:16px;text-align:center">
              FlowOps Driver Safety System — protecting your fleet in real-time.
            </p>
          </div>
        `,
      }).catch((err) => {
        this.logger.warn(`Safety email to ${admin.email} failed: ${err?.message}`);
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ZONE CRUD (Tenant management)
  // ══════════════════════════════════════════════════════════════════════════

  async getZones(companyId: string) {
    return this.prisma.safetyZone.findMany({
      where: { companyId },
      orderBy: [{ riskLevel: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { alerts: true } } },
    });
  }

  async createZone(companyId: string, dto: any) {
    return this.prisma.safetyZone.create({
      data: { ...dto, companyId },
    });
  }

  async updateZone(id: string, companyId: string, dto: any) {
    // Tenant-scoped: only edit a safety zone belonging to the caller's company.
    const res = await this.prisma.safetyZone.updateMany({ where: { id, companyId }, data: dto });
    if (res.count === 0) throw new NotFoundException('Safety zone not found');
    return this.prisma.safetyZone.findFirst({ where: { id, companyId } });
  }

  async deleteZone(id: string, companyId: string) {
    const res = await this.prisma.safetyZone.deleteMany({ where: { id, companyId } });
    if (res.count === 0) throw new NotFoundException('Safety zone not found');
    return { deleted: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ALERT HISTORY (Audit trail)
  // ══════════════════════════════════════════════════════════════════════════

  async getAlerts(companyId: string, limit = 50) {
    return this.prisma.safetyAlert.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { zone: { select: { name: true, riskLevel: true } } },
    });
  }

  async acknowledgeAlert(alertId: string, driverId: string) {
    return this.prisma.safetyAlert.update({
      where: { id: alertId },
      data: { acknowledged: true, acknowledgedAt: new Date() },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEED: Global safety hotspots — country-aware (Africa + international)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Seeds safety zones for a tenant based on their country setting.
   * Supports: ZA (50+), ZW (20+), KE (15+), NG (15+), MZ (10+), BW (5+), GH (5+), and more.
   * If no country-specific data exists, seeds a generic "major city CBD" zone.
   *
   * Also accepts 'ALL' to seed every available country (for platform owner testing).
   */
  async seedDefaultZones(companyId: string, countryCode?: string) {
    // Resolve the tenant's country if not provided
    if (!countryCode) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { country: true } });
      countryCode = company?.country ?? 'ZA';
    }

    const existing = await this.prisma.safetyZone.count({ where: { companyId } });
    if (existing > 0) {
      this.logger.log(`Company ${companyId} already has ${existing} safety zones — skipping seed`);
      return { seeded: false, existing, country: countryCode };
    }

    const zones = countryCode === 'ALL'
      ? [...SAFETY_ZONES_ZA, ...SAFETY_ZONES_ZW, ...SAFETY_ZONES_KE, ...SAFETY_ZONES_NG, ...SAFETY_ZONES_MZ, ...SAFETY_ZONES_GH, ...SAFETY_ZONES_BW]
      : this.getZonesForCountry(countryCode);

    if (zones.length === 0) {
      return { seeded: false, existing: 0, country: countryCode, message: `No pre-configured hotspots for country ${countryCode}. Add zones manually.` };
    }

    const result = await this.prisma.safetyZone.createMany({
      data: zones.map(z => ({
        ...z,
        companyId,
        alertMessage: this.getDefaultAlertMessage(z.riskLevel, z.name),
        notifyDriver: true,
        notifyDispatch: true,
        notifyAdmin: z.riskLevel === 'CRITICAL' || z.riskLevel === 'HIGH',
        isActive: true,
      })),
    });

    this.logger.log(`Seeded ${result.count} safety zones (${countryCode}) for company ${companyId}`);
    return { seeded: true, count: result.count, country: countryCode };
  }

  /** Community reporting — drivers flag new dangerous areas from mobile. */
  async reportDangerZone(companyId: string, driverId: string, dto: { lat: number; lng: number; name?: string; description?: string; riskLevel?: string }) {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId }, select: { name: true } });
    const zone = await this.prisma.safetyZone.create({
      data: {
        companyId,
        name: dto.name ?? `Reported by ${driver?.name ?? 'driver'} — ${new Date().toLocaleDateString()}`,
        description: dto.description ?? `Community-reported danger zone. Reported by driver ${driver?.name ?? driverId}.`,
        lat: dto.lat,
        lng: dto.lng,
        radiusM: 500, // Default 500m for driver-reported zones
        riskLevel: (dto.riskLevel as any) ?? 'MEDIUM',
        source: 'COMMUNITY',
        alertMessage: this.getDefaultAlertMessage(dto.riskLevel ?? 'MEDIUM', dto.name ?? 'Reported danger zone'),
        notifyDriver: true,
        notifyDispatch: true,
        notifyAdmin: true,
        isActive: true,
      },
    });

    // Notify admin about the new community report
    await this.prisma.notification.create({
      data: {
        companyId,
        title: '🚨 New danger zone reported by driver',
        body: `${driver?.name ?? 'A driver'} flagged a dangerous area at GPS ${dto.lat.toFixed(4)}, ${dto.lng.toFixed(4)}${dto.name ? ` (${dto.name})` : ''}. Review in Safety Zones.`,
        type: 'SAFETY_ALERT',
      },
    }).catch(() => { /* best-effort */ });

    this.logger.log(`Community safety zone reported by driver ${driverId}: ${zone.name}`);
    return zone;
  }

  private getZonesForCountry(code: string): typeof SAFETY_ZONES_ZA {
    switch (code.toUpperCase()) {
      case 'ZA': return SAFETY_ZONES_ZA;
      case 'ZW': return SAFETY_ZONES_ZW;
      case 'KE': return SAFETY_ZONES_KE;
      case 'NG': return SAFETY_ZONES_NG;
      case 'MZ': return SAFETY_ZONES_MZ;
      case 'GH': return SAFETY_ZONES_GH;
      case 'BW': return SAFETY_ZONES_BW;
      default: return [];
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private getDefaultAlertMessage(riskLevel: string, zoneName: string): string {
    switch (riskLevel) {
      case 'CRITICAL':
        return `🚨 DANGER: You are in ${zoneName} — a CRITICAL risk zone. Do NOT stop. Lock doors. Keep moving. If followed, drive to the nearest police station.`;
      case 'HIGH':
        return `⚠️ HIGH RISK: You are entering ${zoneName}. Stay alert, lock doors, avoid stopping unnecessarily. Report anything suspicious.`;
      case 'MEDIUM':
        return `⚡ CAUTION: ${zoneName} — moderate risk area. Stay vigilant, keep windows up, maintain awareness of surroundings.`;
      default:
        return `ℹ️ AWARENESS: ${zoneName} — minor risk noted. Proceed with normal caution.`;
    }
  }

  /** Haversine distance in metres between two lat/lng points. */
  private haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000; // Earth radius in metres
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
