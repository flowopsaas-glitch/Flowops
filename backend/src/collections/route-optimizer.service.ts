import { Injectable } from '@nestjs/common';

@Injectable()
export class RouteOptimizerService {
  async suggestBestDriver(collection: any, availableDrivers: any[]) {
    if (availableDrivers.length === 0) return null;

    const scoredDrivers = availableDrivers.map((driver) => {
      let score = 0;

      // 1. 📍 Zone Matching
      if (
        collection.collectionAddress
          ?.toLowerCase()
          .includes(driver.zone?.toLowerCase())
      ) {
        score += 50;
      }

// 2. 🚛 Vehicle Suitability Logic
      const totalUnits = (collection.parcelCount || 0) + (collection.palletCount || 0);
      const vehicle = (driver.vehicleType || '').toUpperCase();

      if (totalUnits <= 5 && vehicle === 'BAKKIE') {
        score += 30; // Optimal: Small load, small vehicle
      } else if (totalUnits > 10 && (vehicle === '8-TON' || vehicle === 'TRUCK')) {
        score += 40; // Optimal: Large load, large vehicle
      } else if (totalUnits > 5 && vehicle === 'BAKKIE') {
        score -= 20; // Risk: Bakkie might be too small
      }

      // 3. 📦 Load Balancing
      const activeJobs = driver._count?.dispatches || 0;
      score -= activeJobs * 15; // Penalize drivers who are already busy

      return { ...driver, matchScore: score };
    });

    return scoredDrivers.sort((a, b) => b.matchScore - a.matchScore)[0];
  }
}
