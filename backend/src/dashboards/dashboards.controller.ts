import { Controller, Get, Post, Put, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('dashboards')
@UseGuards(JwtAuthGuard)
export class DashboardsController {
  constructor(private prisma: PrismaService) {}

  // GET /dashboards/layout?role=ADMIN
  // Returns the active layout for the current user's company and role
  @Get('layout')
  async getLayout(@Request() req: any, @Query('role') role?: string) {
    const userRole = role || req.user.role;
    
    let layout = await this.prisma.dashboardLayout.findFirst({
      where: {
        companyId: req.user.companyId,
        role: userRole as any,
        isActive: true,
        isDefault: true,
      },
    });

    // If no custom default, look for any active layout for this role
    if (!layout) {
      layout = await this.prisma.dashboardLayout.findFirst({
        where: {
          companyId: req.user.companyId,
          role: userRole as any,
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    // If still nothing, return a blank canvas or system default
    if (!layout) {
      return {
        id: null,
        name: 'My Dashboard',
        config: { layout: [] }, // Empty grid
        isNew: true,
      };
    }

    return layout;
  }

  // POST /dashboards/layout
  // Save or Update a layout
  @Post('layout')
  async saveLayout(@Request() req: any, @Body() body: any) {
    const { id, name, config, role } = body;
    const userRole = role || req.user.role;

    if (id) {
      // Update existing
      return this.prisma.dashboardLayout.update({
        where: { id: Number(id) },
        data: { config, name },
      });
    } else {
      // Create new (and set as default for this role if none exists)
      const existingDefault = await this.prisma.dashboardLayout.findFirst({
        where: { companyId: req.user.companyId, role: userRole as any, isDefault: true },
      });

      return this.prisma.dashboardLayout.create({
        data: {
          companyId: req.user.companyId,
          name: name || `${userRole} Dashboard`,
          role: userRole as any,
          config,
          isDefault: !existingDefault, // Make default if first one
        },
      });
    }
  }

  // GET /dashboards/widgets
  // Catalog of available widgets to add
  @Get('widgets')
  getWidgetCatalog() {
    return [
      { id: 'kpi_total_shipments', type: 'KPI', title: 'Total Shipments', defaultSize: { w: 2, h: 2 }, config: { metric: 'totalWaybills' } },
      { id: 'kpi_otd', type: 'KPI', title: 'On-Time Delivery %', defaultSize: { w: 2, h: 2 }, config: { metric: 'otd' } },
      { id: 'chart_volume', type: 'CHART', title: 'Shipment Volume', defaultSize: { w: 4, h: 4 }, config: { chartType: 'line', source: 'volume' } },
      { id: 'map_fleet', type: 'MAP', title: 'Live Fleet Map', defaultSize: { w: 6, h: 6 }, config: {} },
      { id: 'table_exceptions', type: 'TABLE', title: 'Active Exceptions', defaultSize: { w: 6, h: 4 }, config: { source: 'exceptions' } },
    ];
  }
}
