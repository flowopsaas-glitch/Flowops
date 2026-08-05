import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIntegrationDto, UpdateIntegrationDto, IngestOrderDto } from './dto/order-flow.dto';

@Injectable()
export class OrderFlowService {
  private readonly logger = new Logger(OrderFlowService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createIntegration(companyId: string, dto: CreateIntegrationDto) {
    return this.prisma.orderFlowIntegration.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type,
        status: 'CONFIGURING',
        config: dto.config as any,
        credentials: dto.credentials as any,
        autoDispatch: dto.autoDispatch ?? false,
        dispatchRules: dto.dispatchRules as any,
      },
    });
  }

  async listIntegrations(companyId: string) {
    return this.prisma.orderFlowIntegration.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        autoDispatch: true,
        lastSyncAt: true,
        totalOrders: true,
        failedOrders: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getIntegration(id: string, companyId: string) {
    const integration = await this.prisma.orderFlowIntegration.findFirst({
      where: { id, companyId },
      include: { syncLogs: { take: 50, orderBy: { createdAt: 'desc' } } },
    });
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  async updateIntegration(id: string, companyId: string, dto: UpdateIntegrationDto) {
    await this.getIntegration(id, companyId);
    return this.prisma.orderFlowIntegration.update({
      where: { id },
      data: {
        name: dto.name,
        config: dto.config as any,
        autoDispatch: dto.autoDispatch,
        dispatchRules: dto.dispatchRules as any,
        status: dto.status as any,
      },
    });
  }

  async activateIntegration(id: string, companyId: string) {
    const integration = await this.getIntegration(id, companyId);
    if (integration.status === 'ACTIVE') {
      throw new BadRequestException('Integration is already active');
    }
    return this.prisma.orderFlowIntegration.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async deactivateIntegration(id: string, companyId: string) {
    await this.getIntegration(id, companyId);
    return this.prisma.orderFlowIntegration.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  async deleteIntegration(id: string, companyId: string) {
    await this.getIntegration(id, companyId);
    return this.prisma.orderFlowIntegration.delete({ where: { id } });
  }

  async ingestOrder(companyId: string, dto: IngestOrderDto) {
    const integration = await this.getIntegration(dto.integrationId, companyId);
    if (integration.status !== 'ACTIVE') {
      throw new BadRequestException('Integration is not active');
    }

    try {
      // Map external order to waybill creation
      const orderData = dto.orderData;
      const waybill = await this.prisma.waybill.create({
        data: {
          companyId,
          senderName: orderData.senderName || orderData.shopName || 'External Order',
          senderAddress: orderData.senderAddress || '',
          senderPhone: orderData.senderPhone || '',
          recipientName: orderData.recipientName || orderData.customerName || '',
          recipientAddress: orderData.recipientAddress || orderData.shippingAddress || '',
          recipientPhone: orderData.recipientPhone || orderData.customerPhone || '',
          recipientEmail: orderData.recipientEmail || orderData.customerEmail || '',
          description: orderData.description || `Order ${dto.externalOrderId}`,
          weight: orderData.weight ? parseFloat(orderData.weight) : null,
          pieces: orderData.pieces || orderData.items?.length || 1,
          specialInstructions: orderData.notes || orderData.specialInstructions || '',
          status: 'PENDING',
        },
      });

      // Log successful sync
      await this.prisma.orderSyncLog.create({
        data: {
          integrationId: dto.integrationId,
          companyId,
          externalOrderId: dto.externalOrderId,
          waybillId: waybill.id,
          status: 'SUCCESS',
          payload: orderData as any,
        },
      });

      // Update integration stats
      await this.prisma.orderFlowIntegration.update({
        where: { id: dto.integrationId },
        data: {
          totalOrders: { increment: 1 },
          lastSyncAt: new Date(),
        },
      });

      // Auto-dispatch if enabled
      if (integration.autoDispatch) {
        await this.autoDispatchWaybill(waybill.id, companyId, integration.dispatchRules as any);
      }

      return { success: true, waybillId: waybill.id, externalOrderId: dto.externalOrderId };
    } catch (error) {
      // Log failed sync
      await this.prisma.orderSyncLog.create({
        data: {
          integrationId: dto.integrationId,
          companyId,
          externalOrderId: dto.externalOrderId,
          status: 'FAILED',
          errorMessage: error.message,
          payload: dto.orderData as any,
        },
      });

      await this.prisma.orderFlowIntegration.update({
        where: { id: dto.integrationId },
        data: { failedOrders: { increment: 1 } },
      });

      throw new BadRequestException(`Order ingestion failed: ${error.message}`);
    }
  }

  async getSyncLogs(integrationId: string, companyId: string) {
    await this.getIntegration(integrationId, companyId);
    return this.prisma.orderSyncLog.findMany({
      where: { integrationId, companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async autoDispatchWaybill(waybillId: string, companyId: string, rules: any) {
    try {
      // Find available driver
      const driver = await this.prisma.driver.findFirst({
        where: { companyId, status: 'AVAILABLE', isActive: true },
      });

      if (driver) {
        await this.prisma.waybill.update({
          where: { id: waybillId },
          data: { status: 'COLLECTED', driverId: driver.id },
        });
        this.logger.log(`Auto-dispatched waybill ${waybillId} to driver ${driver.id}`);
      }
    } catch (error) {
      this.logger.warn(`Auto-dispatch failed for waybill ${waybillId}: ${error.message}`);
    }
  }
}
