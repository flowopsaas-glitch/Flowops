// src/ai/features/route-optimizer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface OptimizedRoute {
  driverId: number;
  optimizedOrder: number[]; // Collection IDs in optimal order
  estimatedTimeSaved: number; // Minutes saved vs current order
  totalDistance: number; // km
  waypoints: Array<{
    collectionId: number;
    address: string;
    lat: number;
    lng: number;
    estimatedArrival: string;
  }>;
}

@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generate optimized route for a driver's pending collections
   */
  async optimizeRoute(driverId: number): Promise<OptimizedRoute | null> {
    // Get driver location
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver?.lat || !driver?.lng) {
      this.logger.warn(`Driver ${driverId} has no location data`);
      return null;
    }

    // Get driver's pending collections with addresses
    const collections = await this.prisma.collection.findMany({
      where: {
        status: 'PENDING',
        // Could filter by driver assignment if your schema supports it
      },
      select: {
        id: true,
        collectionAddress: true,
        scheduledDate: true,
      },
    });

    if (collections.length === 0) {
      return null;
    }

    // Geocode addresses if lat/lng missing (would use MapTiler API)
    const waypoints = await this.geocodeCollections(collections);
    
    if (waypoints.length === 0) {
      this.logger.warn('No geocodable collections found');
      return null;
    }

    // Run nearest-neighbor algorithm (upgrade to OR-Tools for production)
    const optimized = this.nearestNeighborOptimization(
      { lat: driver.lat, lng: driver.lng },
      waypoints
    );

    // Calculate estimated time saved
    const originalDistance = this.calculateTotalDistance(driver, waypoints);
    const optimizedDistance = this.calculateTotalDistance(driver, optimized);
    const timeSaved = Math.round((originalDistance - optimizedDistance) * 2.5); // ~2.5 min/km avg

    return {
      driverId,
      optimizedOrder: optimized.map(w => w.collectionId),
      estimatedTimeSaved: Math.max(0, timeSaved),
      totalDistance: Math.round(optimizedDistance),
      waypoints: optimized.map((wp, index) => ({
        collectionId: wp.collectionId,
        address: wp.address,
        lat: wp.lat,
        lng: wp.lng,
        estimatedArrival: this.estimateArrivalTime(index, optimizedDistance),
      })),
    };
  }

  /**
   * Geocode collection addresses (mock implementation)
   * In production: integrate with MapTiler/Google Geocoding API
   */
  private async geocodeCollections(collections: any[]): Promise<Array<{
    collectionId: number;
    address: string;
    lat: number;
    lng: number;
  }>> {
    const waypoints: Array<{
      collectionId: number;
      address: string;
      lat: number;
      lng: number;
    }> = [];

    for (const col of collections) {
      // Use existing lat/lng if available
      if (col.lat && col.lng) {
        waypoints.push({
          collectionId: col.id,
          address: col.collectionAddress || 'Unknown address',
          lat: col.lat,
          lng: col.lng,
        });
        continue;
      }

      // Mock geocoding (replace with actual API call)
      // In production: call MapTiler Geocoding API
      const mockCoords = this.mockGeocode(col.collectionAddress);
      
      if (mockCoords) {
        waypoints.push({
          collectionId: col.id,
          address: col.collectionAddress || 'Unknown address',
          lat: mockCoords.lat,
          lng: mockCoords.lng,
        });
      }
    }

    return waypoints;
  }

  /**
   * Mock geocoding for development
   */
  private mockGeocode(address?: string): { lat: number; lng: number } | null {
    if (!address) return null;
    
    // Simple keyword-based mock (Johannesburg area)
    const keywords: Record<string, { lat: number; lng: number }> = {
      'johannesburg': { lat: -26.2041, lng: 28.0473 },
      'sandton': { lat: -26.1076, lng: 28.0567 },
      'pretoria': { lat: -25.7479, lng: 28.2293 },
      'cape town': { lat: -33.9249, lng: 18.4241 },
      'durban': { lat: -29.8587, lng: 31.0218 },
    };

    const lower = address.toLowerCase();
    for (const [key, coords] of Object.entries(keywords)) {
      if (lower.includes(key)) {
        // Add small random offset for variety
        return {
          lat: coords.lat + (Math.random() - 0.5) * 0.1,
          lng: coords.lng + (Math.random() - 0.5) * 0.1,
        };
      }
    }

    return null;
  }

  /**
   * Nearest-neighbor route optimization
   * Simple greedy algorithm (upgrade to OR-Tools/Google Routes API for production)
   */
  private nearestNeighborOptimization(
    start: { lat: number; lng: number },
    waypoints: Array<{ collectionId: number; lat: number; lng: number; address: string }>
  ): Array<{ collectionId: number; lat: number; lng: number; address: string }> {
    
    const remaining = [...waypoints];
    const optimized: typeof waypoints = [];
    let current = start;

    while (remaining.length > 0) {
      // Find nearest unvisited waypoint
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = this.haversine(
          current.lat, current.lng,
          remaining[i].lat, remaining[i].lng
        );
        
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      // Add to optimized route
      const next = remaining.splice(nearestIdx, 1)[0];
      optimized.push(next);
      current = { lat: next.lat, lng: next.lng };
    }

    return optimized;
  }

  /**
   * Calculate total route distance using Haversine formula
   */
  private calculateTotalDistance(
    start: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }>
  ): number {
    let total = 0;
    let current = start;

    for (const wp of waypoints) {
      total += this.haversine(current.lat, current.lng, wp.lat, wp.lng);
      current = wp;
    }

    return total;
  }

  /**
   * Haversine formula for distance between two lat/lng points (in km)
   */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Estimate arrival time for a waypoint (simplified)
   */
  private estimateArrivalTime(waypointIndex: number, totalDistance: number): string {
    // Assume 40 km/h average speed in urban SA
    const avgSpeedKmh = 40;
    const timePerWaypoint = (totalDistance / avgSpeedKmh / (waypointIndex + 1)) * 60; // minutes
    
    const arrival = new Date(Date.now() + timePerWaypoint * 60 * 1000);
    return arrival.toISOString();
  }

  /**
   * Batch optimize routes for all drivers with pending collections
   */
  async optimizeAllRoutes(companyId: number): Promise<{ optimized: number; skipped: number }> {
    // Get drivers with pending collections
    const drivers = await this.prisma.driver.findMany({
      where: { companyId },
      select: { id: true },
    });

    let optimized = 0;
    let skipped = 0;

    for (const driver of drivers) {
      try {
        const result = await this.optimizeRoute(driver.id);
        
        if (result) {
          // Store optimization result (could save to DB for driver app)
          this.logger.debug(`Optimized route for driver ${driver.id}: ${result.estimatedTimeSaved}min saved`);
          optimized++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        this.logger.error(`Failed to optimize route for driver ${driver.id}: ${error.message}`);
        skipped++;
      }
    }

    this.logger.log(`Route optimization complete: ${optimized} optimized, ${skipped} skipped`);
    return { optimized, skipped };
  }
}
