import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateGeofenceDto } from './dto/create-geofence.dto';
import { LocationGateway } from '../location.gateway';

@Injectable()
export class GpsTrackingService {
  constructor(
    private prisma: PrismaService,
    private locationGateway: LocationGateway,
  ) {}

  async updateLocation(driverId: number, dto: UpdateLocationDto) {
    // Get driver info for broadcasting
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, name: true, companyId: true },
    });

    const location = await this.prisma.driverLocation.create({
      data: {
        driverId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        altitude: dto.altitude,
        speed: dto.speed,
        heading: dto.heading,
        accuracy: dto.accuracy,
        batteryLevel: dto.batteryLevel,
        signalStrength: dto.signalStrength,
        address: dto.address,
      },
    });

    // 🚀 BROADCAST LIVE LOCATION via WebSocket
    if (driver) {
      this.locationGateway.broadcastLocation(driver.companyId, {
        driverId,
        driverName: driver.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speed: dto.speed,
        heading: dto.heading,
        timestamp: location.timestamp,
      });
    }

    await this.checkGeofences(driverId, dto.latitude, dto.longitude);
    
    // 🚀 Check for active trips and update ETA
    await this.updateTripETA(driverId, dto.latitude, dto.longitude);
    
    return location;
  }

  /**
   * 🚀 Update trip ETA based on current location
   */
  private async updateTripETA(driverId: number, lat: number, lng: number) {
    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        status: 'IN_PROGRESS',
      },
      include: {
        stops: {
          where: { actualArrival: null },
          orderBy: { sequence: 'asc' },
          take: 1,
        },
      },
    });

    if (!activeTrip || activeTrip.stops.length === 0) return;

    const nextStop = activeTrip.stops[0];
    
    // Calculate distance to next stop (Haversine formula)
    const distance = this.calculateDistance(
      lat, lng,
      nextStop.latitude, nextStop.longitude
    );

    // Estimate time based on average speed (40 km/h in urban SA)
    const avgSpeedKmh = 40;
    const estimatedMinutes = Math.round((distance / avgSpeedKmh) * 60);
    const newETA = new Date(Date.now() + estimatedMinutes * 60 * 1000);

    // Update stop with new ETA
    await this.prisma.tripStop.update({
      where: { id: nextStop.id },
      data: { plannedArrival: newETA },
    });

    // Broadcast ETA update
    this.locationGateway.broadcastETAUpdate(activeTrip.companyId, {
      tripId: activeTrip.id,
      driverId,
      stopId: nextStop.id,
      newETA: newETA.toISOString(),
      distanceRemaining: Math.round(distance * 10) / 10,
      estimatedMinutes,
    });
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async getDriverLocation(driverId: number) {
    return this.prisma.driverLocation.findFirst({
      where: { driverId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async getDriverHistory(driverId: number, startTime: Date, endTime: Date) {
    return this.prisma.driverLocation.findMany({
      where: { driverId, timestamp: { gte: startTime, lte: endTime } },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getAllDriverLocations(companyId: number) {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId },
      select: { id: true, name: true, phone: true },
    });
    const locations = await Promise.all(
      drivers.map(async (driver) => {
        const location = await this.prisma.driverLocation.findFirst({
          where: { driverId: driver.id },
          orderBy: { timestamp: 'desc' },
        });
        return { driver, location };
      })
    );
    return locations.filter((l) => l.location !== null);
  }

  async createTrip(companyId: number, dto: CreateTripDto) {
    return this.prisma.trip.create({
      data: {
        companyId,
        driverId: dto.driverId,
        vehicleId: dto.vehicleId,
        manifestId: dto.manifestId,
        startLocation: dto.startLocation,
        endLocation: dto.endLocation,
        startLatitude: dto.startLatitude,
        startLongitude: dto.startLongitude,
        endLatitude: dto.endLatitude,
        endLongitude: dto.endLongitude,
        plannedDistance: dto.plannedDistance,
        plannedDuration: dto.plannedDuration,
        notes: dto.notes,
        stops: dto.stops
          ? {
              create: dto.stops.map((stop, index) => ({
                sequence: index + 1,
                location: stop.location,
                latitude: stop.latitude,
                longitude: stop.longitude,
                plannedArrival: stop.plannedArrival ? new Date(stop.plannedArrival) : null,
                plannedDeparture: stop.plannedDeparture ? new Date(stop.plannedDeparture) : null,
              })),
            }
          : undefined,
      },
      include: { stops: true, driver: true },
    });
  }

  async startTrip(tripId: number, companyId: number) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, companyId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
  }

  async completeTrip(tripId: number, companyId: number, actualDistance?: number) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, companyId } });
    if (!trip) throw new NotFoundException('Trip not found');
    const actualDuration = trip.startedAt
      ? Math.round((Date.now() - trip.startedAt.getTime()) / 60000)
      : null;
    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'COMPLETED', completedAt: new Date(), actualDistance, actualDuration },
    });
  }

  async getTrips(companyId: number, filters?: { driverId?: number; status?: string }) {
    const where: any = { companyId };
    if (filters?.driverId) where.driverId = filters.driverId;
    if (filters?.status) where.status = filters.status;
    return this.prisma.trip.findMany({
      where,
      include: { driver: true, stops: { orderBy: { sequence: 'asc' } }, _count: { select: { locations: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTrip(tripId: number, companyId: number) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
      include: {
        driver: true,
        stops: { orderBy: { sequence: 'asc' } },
        locations: { orderBy: { timestamp: 'asc' }, take: 1000 },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  async createGeofence(companyId: number, dto: CreateGeofenceDto) {
    return this.prisma.geofence.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radius: dto.radius,
        polygon: dto.polygon,
      },
    });
  }

  async getGeofences(companyId: number) {
    return this.prisma.geofence.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteGeofence(id: number, companyId: number) {
    const geofence = await this.prisma.geofence.findFirst({ where: { id, companyId } });
    if (!geofence) throw new NotFoundException('Geofence not found');
    return this.prisma.geofence.update({ where: { id }, data: { isActive: false } });
  }

  private async checkGeofences(driverId: number, latitude: number, longitude: number) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { companyId: true },
    });
    if (!driver) return;
    const geofences = await this.prisma.geofence.findMany({
      where: { companyId: driver.companyId, isActive: true },
    });
    const lastLocation = await this.prisma.driverLocation.findFirst({
      where: { driverId },
      orderBy: { timestamp: 'desc' },
      skip: 1,
    });
    for (const geofence of geofences) {
      const isInside = this.isPointInGeofence(latitude, longitude, geofence);
      if (lastLocation) {
        const wasInside = this.isPointInGeofence(lastLocation.latitude, lastLocation.longitude, geofence);
        if (!wasInside && isInside) {
          await this.createGeofenceAlert(geofence.id, driverId, 'ENTER', latitude, longitude);
        } else if (wasInside && !isInside) {
          await this.createGeofenceAlert(geofence.id, driverId, 'EXIT', latitude, longitude);
        }
      }
    }
  }

  private isPointInGeofence(lat: number, lng: number, geofence: any): boolean {
    if (geofence.type === 'CIRCLE') {
      const distance = this.calculateDistance(lat, lng, geofence.latitude, geofence.longitude);
      return distance <= (geofence.radius || 100);
    } else if (geofence.type === 'POLYGON' && geofence.polygon) {
      return this.isPointInPolygon(lat, lng, geofence.polygon);
    }
    return false;
  }


  private isPointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private async createGeofenceAlert(
    geofenceId: number, driverId: number, eventType: 'ENTER' | 'EXIT',
    latitude: number, longitude: number
  ) {
    await this.prisma.geofenceAlert.create({
      data: { geofenceId, driverId, eventType, latitude, longitude },
    });
  }

  async getGeofenceAlerts(companyId: number, unreadOnly = false) {
    return this.prisma.geofenceAlert.findMany({
      where: { geofence: { companyId }, ...(unreadOnly && { isRead: false }) },
      include: { geofence: true, driver: true },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
  }

  async getTripAnalytics(tripId: number, companyId: number) {
    const trip = await this.getTrip(tripId, companyId);
    if (trip.locations.length < 2) {
      return { totalDistance: 0, averageSpeed: 0, maxSpeed: 0, stops: 0 };
    }
    let totalDistance = 0, totalSpeed = 0, maxSpeed = 0, stopCount = 0;
    for (let i = 1; i < trip.locations.length; i++) {
      const prev = trip.locations[i - 1];
      const curr = trip.locations[i];
      totalDistance += this.calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      if (curr.speed) {
        totalSpeed += curr.speed;
        maxSpeed = Math.max(maxSpeed, curr.speed);
      }
      if (curr.speed && curr.speed < 5) {
        const timeDiff = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
        if (timeDiff > 60) stopCount++;
      }
    }
    return {
      totalDistance: totalDistance / 1000,
      averageSpeed: Math.round((totalSpeed / trip.locations.length) * 10) / 10,
      maxSpeed: Math.round(maxSpeed * 10) / 10,
      stops: stopCount,
      locationPoints: trip.locations.length,
    };
  }
}
