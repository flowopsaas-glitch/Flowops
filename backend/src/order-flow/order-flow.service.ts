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

  /**
   * Ingest one external order.
   *
   * IDEMPOTENCY — this is a webhook endpoint. Stores retry a delivery whenever
   * they do not receive a 2xx, including when our work succeeded and only the
   * response was lost. So the same external order legitimately arrives more than
   * once. The sync log already records every successful ingestion keyed by
   * (integrationId, externalOrderId); it is consulted first, and a repeat
   * delivery returns the original waybill instead of creating a second one.
   * Without this, every retry became another shipment to pay for.
   */
  async ingestOrder(
    companyId: string,
    dto: IngestOrderDto,
  ): Promise<{
    success: boolean;
    duplicate: boolean;
    waybillId: string;
    externalOrderId: string;
  }> {
    const integration = await this.getIntegration(dto.integrationId, companyId);
    if (integration.status !== 'ACTIVE') {
      throw new BadRequestException('Integration is not active');
    }

    const orderData = dto.orderData ?? {};

    // Weight is a Float column. parseFloat('heavy') is NaN, which is neither
    // validated by the DTO (orderData is a free-form object) nor rejected by the
    // service — it reached the database as a broken value.
    let weight: number | null = null;
    if (orderData.weight !== undefined && orderData.weight !== null && orderData.weight !== '') {
      const parsed = Number(orderData.weight);
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(`Order weight is not a number: ${orderData.weight}`);
      }
      if (parsed < 0) {
        throw new BadRequestException('Order weight cannot be negative');
      }
      weight = parsed;
    }

    // A repeat delivery must be recognised BEFORE any write, and the check has to
    // be scoped to the integration: two stores can both own order 1001.
    const already = await this.prisma.orderSyncLog.findFirst({
      where: {
        integrationId: dto.integrationId,
        companyId,
        externalOrderId: dto.externalOrderId,
        status: 'SUCCESS',
      },
      select: { waybillId: true },
    });
    if (already?.waybillId) {
      this.logger.log(
        `Order ${dto.externalOrderId} already ingested as waybill ${already.waybillId}; ignoring retry`,
      );
      return {
        success: true,
        duplicate: true,
        waybillId: already.waybillId,
        externalOrderId: dto.externalOrderId,
      };
    }

    try {
      // Waybill, sync log and counter are one transaction. Previously they were
      // three independent writes: a crash between the first and the second left a
      // waybill with no log entry, so the retry above could not tell it had run
      // and created a duplicate — the failure made itself unrecoverable.
      const waybillId = await this.prisma.withTenant(companyId, async (tx) => {
        const waybill = await tx.waybill.create({
          data: {
            companyId,
            trackingNumber: `OF-${dto.externalOrderId}-${Date.now()}`,
            senderName: orderData.senderName || orderData.shopName || 'External Order',
            senderAddress: orderData.senderAddress || '',
            senderPhone: orderData.senderPhone || '',
            recipientName: orderData.recipientName || orderData.customerName || '',
            recipientAddress: orderData.recipientAddress || orderData.shippingAddress || '',
            recipientPhone: orderData.recipientPhone || orderData.customerPhone || '',
            recipientEmail: orderData.recipientEmail || orderData.customerEmail || '',
            description: orderData.description || `Order ${dto.externalOrderId}`,
            weight,
            status: 'PENDING',
          },
        });

        await tx.orderSyncLog.create({
          data: {
            integrationId: dto.integrationId,
            companyId,
            externalOrderId: dto.externalOrderId,
            waybillId: waybill.id,
            status: 'SUCCESS',
            payload: orderData as any,
          },
        });

        await tx.orderFlowIntegration.update({
          where: { id: dto.integrationId },
          data: { totalOrders: { increment: 1 }, lastSyncAt: new Date() },
        });

        return waybill.id;
      });

      // Best-effort and deliberately outside the transaction: a dispatch failure
      // must not roll back a waybill that was successfully created.
      if (integration.autoDispatch) {
        await this.autoDispatchWaybill(waybillId, companyId, integration.dispatchRules as any);
      }

      return {
        success: true,
        duplicate: false,
        waybillId,
        externalOrderId: dto.externalOrderId,
      };
    } catch (error: any) {
      const message = error?.message ?? String(error);
      await this.recordFailure(companyId, dto, message);
      throw new BadRequestException(`Order ingestion failed: ${message}`);
    }
  }

  /**
   * Record a failed ingestion. Deliberately not part of the caller's transaction
   * — that one has rolled back, so this has to stand on its own. If it also
   * fails there is nowhere useful to report it, so it is logged and swallowed
   * rather than masking the original error.
   */
  private async recordFailure(companyId: string, dto: IngestOrderDto, message: string) {
    try {
      await this.prisma.withTenant(companyId, async (tx) => {
        await tx.orderSyncLog.create({
          data: {
            integrationId: dto.integrationId,
            companyId,
            externalOrderId: dto.externalOrderId,
            status: 'FAILED',
            errorMessage: message,
            payload: (dto.orderData ?? {}) as any,
          },
        });
        await tx.orderFlowIntegration.update({
          where: { id: dto.integrationId },
          data: { failedOrders: { increment: 1 } },
        });
      });
    } catch (logError: any) {
      this.logger.error(
        `Could not record failed order ${dto.externalOrderId}: ${logError?.message ?? logError}`,
      );
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

  private async autoDispatchWaybill(waybillId: string, companyId: string, _rules: any) {
    try {
      // Find available driver
      const driver = await this.prisma.driver.findFirst({
        where: { companyId, status: 'AVAILABLE', isActive: true },
      });

      if (driver) {
        await this.prisma.waybill.update({
          where: { id: waybillId },
          data: { status: 'COLLECTED' },
        });
        this.logger.log(`Auto-dispatched waybill ${waybillId} to driver ${driver.id}`);
      }
    } catch (error) {
      this.logger.warn(`Auto-dispatch failed for waybill ${waybillId}: ${error.message}`);
    }
  }
}
