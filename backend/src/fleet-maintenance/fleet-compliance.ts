import { BadRequestException } from '@nestjs/common';

export interface FleetComplianceDriver {
  id: string;
  companyId?: string;
  currentKm?: number | null;
  nextServiceKm?: number | null;
  nextServiceDate?: Date | string | null;
}

export interface FleetComplianceAuthorization {
  allowNonCompliant: boolean;
  reason?: string;
}

export interface FleetComplianceDecision {
  compliant: boolean;
  allowed: boolean;
  reason: string;
}

export function decideFleetCompliance(
  driver: FleetComplianceDriver,
  now = new Date(),
  authorization?: FleetComplianceAuthorization,
): FleetComplianceDecision {
  const overdueByKm =
    driver.currentKm != null &&
    driver.nextServiceKm != null &&
    driver.currentKm >= driver.nextServiceKm;
  const overdueByDate =
    driver.nextServiceDate != null &&
    new Date(driver.nextServiceDate).getTime() <= now.getTime();

  if (!overdueByKm && !overdueByDate) {
    return { compliant: true, allowed: true, reason: 'Vehicle maintenance is current' };
  }

  const reason = overdueByKm && overdueByDate
    ? 'Vehicle service is overdue by mileage and date'
    : overdueByKm
      ? 'Vehicle service is overdue by mileage'
      : 'Vehicle service date has expired';

  if (authorization?.allowNonCompliant && authorization.reason?.trim()) {
    return {
      compliant: false,
      allowed: true,
      reason: `${reason}; dispatch authorized: ${authorization.reason.trim()}`,
    };
  }

  return { compliant: false, allowed: false, reason };
}

export function assertFleetDispatchAllowed(
  driver: FleetComplianceDriver,
  now?: Date,
  authorization?: FleetComplianceAuthorization,
): FleetComplianceDecision {
  const decision = decideFleetCompliance(driver, now, authorization);
  if (!decision.allowed) {
    throw new BadRequestException(`Dispatch blocked: ${decision.reason}`);
  }
  return decision;
}
