import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Order received',
  COLLECTED: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Delivery attempt failed',
  RETURNED: 'Returned to sender',
  CANCELLED: 'Cancelled',
};

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  private firstName(full?: string | null) {
    return (full || '').trim().split(/\s+/)[0] || '';
  }

  /**
   * Public tracking payload for a tracking number. Returns only what a customer
   * needs to follow their parcel (status, ETA, live position, branding) — no
   * sensitive PII such as full addresses or phone numbers.
   */
  async track(trackingNumber: string) {
    const waybill = await this.prisma.waybill.findFirst({
      where: { trackingNumber },
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { brandName: true, name: true, logoUrl: true, primaryColor: true },
        },
        shipments: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: { driver: { select: { name: true, vehicleReg: true } } },
        },
      },
    });

    if (!waybill) {
      throw new NotFoundException('Tracking number not found.');
    }

    const shipment = waybill.shipments[0] ?? null;
    const status = waybill.status;
    const delivered = status === 'DELIVERED' || Boolean(waybill.podDeliveredAt);

    const current =
      shipment?.currentLat != null && shipment?.currentLng != null
        ? { lat: shipment.currentLat, lng: shipment.currentLng }
        : null;
    const destination =
      waybill.recipientLat != null && waybill.recipientLng != null
        ? { lat: waybill.recipientLat, lng: waybill.recipientLng }
        : null;

    // ── Predictive ETA via OSRM (traffic-aware road routing) ─────────────
    // OSRM public demo used when OSRM_BASE_URL is not set — works well for
    // testing. Set OSRM_BASE_URL to a self-hosted instance for production.
    // Falls back to great-circle approximation on any network error.
    let etaMinutes: number | null = null;
    let remainingKm: number | null = null;
    if (!delivered && current && destination) {
      try {
        const osrmBase = process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org';
        const url =
          `${osrmBase}/route/v1/driving/` +
          `${current.lng},${current.lat};${destination.lng},${destination.lat}` +
          `?overview=false&annotations=false`;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);

        if (res.ok) {
          const data: any = await res.json();
          const route = data?.routes?.[0];
          if (route?.distance != null && route?.duration != null) {
            remainingKm  = Math.round((route.distance / 1000) * 10) / 10;
            etaMinutes   = Math.max(1, Math.round(route.duration / 60));
          }
        }
      } catch { /* fall through to haversine */ }

      // Haversine fallback if OSRM failed / timed out
      if (remainingKm == null) {
        const gc = GeocodingService.haversineKm(
          current.lat, current.lng,
          destination.lat, destination.lng,
        );
        remainingKm = Math.round(gc * 10) / 10;
        etaMinutes  = Math.max(1, Math.round((gc / 35) * 60));
      }
    }

    const timeline = [
      { status: 'PENDING', label: STATUS_LABELS.PENDING, at: waybill.createdAt },
      delivered
        ? { status: 'DELIVERED', label: STATUS_LABELS.DELIVERED, at: waybill.podDeliveredAt }
        : null,
    ].filter(Boolean);

    const brand = waybill.company;
    return {
      trackingNumber: waybill.trackingNumber,
      status,
      statusLabel: STATUS_LABELS[status] ?? status,
      delivered,
      recipientName: this.firstName(waybill.recipientName),
      driver: shipment?.driver
        ? { name: this.firstName(shipment.driver.name), vehicleReg: shipment.driver.vehicleReg ?? null }
        : null,
      current,
      destination,
      remainingKm,
      etaMinutes,
      estimatedDelivery: shipment?.estimatedDelivery ?? null,
      deliveredAt: waybill.podDeliveredAt ?? null,
      // Only expose the rating token once the parcel is delivered — prevents
      // customers from accessing the rating page before they've received it.
      ratingToken: delivered ? (waybill.ratingToken ?? null) : null,
      timeline,
      branding: {
        brandName: brand?.brandName || brand?.name || 'FlowOps',
        logoUrl: brand?.logoUrl || null,
        primaryColor: brand?.primaryColor || '#10b981',
      },
      updatedAt: shipment?.updatedAt ?? waybill.updatedAt,
    };
  }
}
