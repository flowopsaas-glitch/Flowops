#!/bin/bash
# FLOWOPS COMMERCIAL INTEGRITY AUDIT & FIX
# VERSION: 15.0-PRO-LAUNCH

echo "################################################################################"
echo "#                     FLOWOPS COMMERCIAL INTEGRITY AUDIT                       #"
echo "################################################################################"

# 1. AUDIT: Waybill Path Resolution
echo -e "\n[01/03] AUDITING: Backend Waybill URL Resolution..."
SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"
if grep -q "fileUrl: file.filename" "$SERVICE_FILE"; then
    echo "  [✘] ISSUE: fileUrl is saving raw filenames. Images will 404."
    sed -i "s/fileUrl: file.filename/fileUrl: \`\/uploads\/\${file.filename}\`/g" "$SERVICE_FILE"
    echo "  [✔] FIXED: Updated to browser-accessible path: /uploads/filename"
else
    echo "  [✔] VALIDATED: Backend is already resolving paths correctly."
fi

# 2. AUDIT: Platform Suspend Guard (Commercial Hardening)
echo -e "\n[02/03] AUDITING: Platform Suspend Guard (Billing/HQ Bypass)..."
GUARD_FILE="src/legal/platform-suspend.guard.ts"
mkdir -p src/legal
cat << INNER_EOF > "$GUARD_FILE"
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformSuspendGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const companyId = request.user?.companyId;

    // 🛡️ FOUNDER BYPASS: HQ (Company 1) is never suspended
    if (companyId === 1) return true;

    // Standard tenant check
    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { isActive: true }
      });

      if (company && !company.isActive) {
        throw new ForbiddenException('FlowOps Access Suspended: Please contact billing@flowops.co.za');
      }
    }

    return true;
  }
}
INNER_EOF
echo "  [✔] HARDENED: Guard now checks isActive DB status with Company 1 bypass."

# 3. AUDIT: Static Asset Serving
echo -e "\n[03/03] AUDITING: AppModule Static Asset Config..."
if grep -q "ServeStaticModule" src/app.module.ts; then
    echo "  [✔] VALIDATED: ServeStaticModule is active."
else
    echo "  [✘] ISSUE: AppModule is not serving the /uploads folder."
fi

echo -e "\n================================================================================"
echo "AUDIT COMPLETE. REBOOTING HARDENED ENGINE..."
echo "================================================================================"
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
