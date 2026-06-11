import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FleetMapService {
  constructor(private prisma: PrismaService) {}

  async getActiveDrivers(companyId: number) {
    const drivers = await this.prisma.driver.findMany({
      where: {
        companyId,
        OR: [
          { status: 'ON_DUTY' },
          { status: 'EN_ROUTE' },
          { status: 'AVAILABLE' },
        ],
      },
      include: {
        waybills: {
          where: {
            status: {
              in: ['IN_TRANSIT'],
            },
          },
          select: {
            id: true,
            waybillNumber: true,
            status: true,
            destination: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const driversWithLocations = await Promise.all(
      drivers.map(async (driver: any) => {
        const latestLocation = await this.prisma.driverLocation.findFirst({
          where: { driverId: driver.id },
          orderBy: { timestamp: 'desc' },
        });

        return {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          status: driver.status,
          vehicleReg: driver.vehicleReg,
          vehicleType: driver.vehicleType,
          lat: latestLocation?.latitude || driver.lat,
          lng: latestLocation?.longitude || driver.lng,
          speed: latestLocation?.speed || 0,
          heading: latestLocation?.heading,
          lastUpdate: latestLocation?.timestamp,
          activeDeliveries: driver.waybills?.length || 0,
          deliveries: driver.waybills || [],
        };
      }),
    );

    return driversWithLocations;
  }

  async getDriverLocation(driverId: number) {
    const location = await this.prisma.driverLocation.findFirst({
      where: { driverId },
      orderBy: { timestamp: 'desc' },
    });

    return location;
  }

  async getFleetStats(companyId: number) {
    const drivers = await this.prisma.driver.findMany({ where: { companyId } });
    const totalDrivers = drivers.length;
    const activeDrivers = drivers.filter(d => 
      d.status === 'ON_DUTY' || d.status === 'EN_ROUTE' || d.status === 'AVAILABLE'
    ).length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDeliveries = await this.prisma.waybill.count({
      where: {
        driver: { companyId },
        status: 'DELIVERED',
        updatedAt: { gte: today },
      },
    });

    const inTransit = await this.prisma.waybill.count({
      where: {
        driver: { companyId },
        status: { in: ['IN_TRANSIT'] },
      },
    });

    return {
      totalDrivers,
      activeDrivers,
      offlineDrivers: totalDrivers - activeDrivers,
      todayDeliveries,
      inTransit,
    };
  }
}
