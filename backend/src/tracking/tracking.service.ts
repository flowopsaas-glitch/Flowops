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

    // Predictive ETA: remaining road distance approximated by great-circle km
    // at an average urban speed. Falls back to the planned estimatedDelivery.
    let etaMinutes: number | null = null;
    let remainingKm: number | null = null;
    if (!delivered && current && destination) {
      remainingKm = GeocodingService.haversineKm(
        current.lat,
        current.lng,
        destination.lat,
        destination.lng,
      );
      const avgSpeedKmh = 35; // conservative urban average incl. stops
      etaMinutes = Math.max(1, Math.round((remainingKm / avgSpeedKmh) * 60));
      remainingKm = Math.round(remainingKm * 10) / 10;
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
