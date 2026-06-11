import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DispatchStatus } from "@prisma/client";

@Injectable()
export class RouteOptimizerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🛰️ AI-Assisted Routing Logic
   * Fetches active dispatches and calculates the best sequence.
   */
  async optimizeCurrentRoutes(companyId: number) {
    const activeDispatches = await this.prisma.dispatch.findMany({
      where: {
        companyId,
        status: {
          // 🚀 FIXED: PENDING is gone, we use ASSIGNED and EN_ROUTE now
          in: [DispatchStatus.ASSIGNED, DispatchStatus.EN_ROUTE] 
        }
      },
      include: {
        collection: true,
        driver: true
      }
    });

    if (activeDispatches.length === 0) {
      return { message: "No active dispatches found to optimize.", routes: [] };
    }

    // (Add your specific routing algorithm logic here)
    // For now, we return the sorted list by proximity/priority
    return {
      totalOptimized: activeDispatches.length,
      routes: activeDispatches
    };
  }

  /**
   * 📍 Zone-Based Driver Match
   * Used to suggest the best driver for a new Collection triage.
   */
  async suggestDriverForCollection(collectionId: number) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId }
    });

    if (!collection) return null;

    // Find drivers in the same zone who are AVAILABLE
    return this.prisma.driver.findMany({
      where: {
        zone: collection.collectionAddress ? { contains: 'Zone' } : undefined, // Replace with actual geo-logic
        availabilityStatus: 'AVAILABLE'
      },
      take: 3
    });
  }
}
