import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PRODUCTION FIX (2026-10-07):
 * Fleet Compliance Guard — Consistent Policy Enforcement
 * 
 * Ensures driver compliance (license, insurance, service, background check, etc.)
 * is checked uniformly across:
 * - Auto-dispatch assignment
 * - Manual shipment creation
 * - Waybill collection
 * - Route assignment
 * 
 * Single source of truth for compliance policy.
 */

export interface ComplianceCheckResult {
  compliant: boolean;
  issues: string[];
  canDispatch: boolean;
}

@Injectable()
export class FleetComplianceGuard {
  constructor(private prisma: PrismaService) {}

  /**
   * Unified driver compliance check.
   * Called by dispatch, shipment, waybill, and routing services.
   */
  async checkDriver(driverId: string, companyId: string): Promise<ComplianceCheckResult> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        companyId: true,
        licenseExpiry: true,
        insuranceExpiry: true,
        backgroundCheckExpiry: true,
        nextServiceDue: true,
        isActive: true,
        status: true,
      },
    });

    if (!driver) {
      return { compliant: false, issues: ['Driver not found'], canDispatch: false };
    }

    if (driver.companyId !== companyId) {
      return { compliant: false, issues: ['Company mismatch'], canDispatch: false };
    }

    const issues: string[] = [];
    const today = new Date();

    // Check license
    if (!driver.licenseExpiry || new Date(driver.licenseExpiry) < today) {
      issues.push('License expired');
    }

    // Check insurance
    if (!driver.insuranceExpiry || new Date(driver.insuranceExpiry) < today) {
      issues.push('Insurance expired');
    }

    // Check background check
    if (!driver.backgroundCheckExpiry || new Date(driver.backgroundCheckExpiry) < today) {
      issues.push('Background check expired');
    }

    // Check service (warning only, not blocking)
    if (driver.nextServiceDue && new Date(driver.nextServiceDue) < today) {
      issues.push('Service overdue (warning)');
    }

    // Active and available status
    if (!driver.isActive) {
      issues.push('Driver inactive');
    }

    if (driver.status !== 'AVAILABLE') {
      issues.push(`Driver status is ${driver.status}, not AVAILABLE`);
    }

    return {
      compliant: issues.filter(i => !i.includes('warning')).length === 0,
      issues,
      canDispatch: issues.filter(i => !i.includes('warning')).length === 0,
    };
  }
}
