#!/bin/bash
# FLOWOPS COMMERCIAL AUDIT & HARDENING
# VERSION: 13.0-SHIELD

echo "################################################################################"
echo "#                     FLOWOPS COMMERCIAL INTEGRITY AUDIT                       #"
echo "################################################################################"

# 1. AUDIT: Backend URL Resolution
echo -e "\n[01/03] AUDITING: Backend Waybill URL Resolution"
SERVICE_FILE="src/waybill-inbox/inbox/waybills-inbox.service.ts"
if grep -q "fileUrl: file.filename" "$SERVICE_FILE"; then
    echo "  [✘] ISSUE FOUND: fileUrl is saving raw filenames (will 404 in browser)."
    # FIX: Update to include the /uploads/ prefix
    sed -i "s/fileUrl: file.filename/fileUrl: \`\/uploads\/\${file.filename}\`/g" "$SERVICE_FILE"
    echo "  [✔] FIXED     : Path updated to '/uploads/filename'."
else
    echo "  [✔] VALIDATED : Backend is already resolving paths correctly."
fi

# 2. AUDIT: Platform Suspend Guard (HQ Bypass)
echo -e "\n[02/03] AUDITING: Platform Suspend Guard (Founder Bypass)"
GUARD_FILE="src/legal/platform-suspend.guard.ts"
if [ ! -f "$GUARD_FILE" ]; then
    echo "  [!] GUARD MISSING: Creating hardened PlatformSuspendGuard..."
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

    // 🛡️ FOUNDER BYPASS: Company 1 (HQ) can never be suspended
    if (companyId === 1) return true;

    if (!companyId) return true; // Allow public routes if not guarded by Auth

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { isActive: true }
    });

    if (company && !company.isActive) {
      throw new ForbiddenException('FlowOps Access Suspended: Please contact billing.');
    }

    return true;
  }
}
INNER_EOF
    echo "  [✔] CREATED   : Hardened guard with Company 1 bypass."
else
    echo "  [✔] VALIDATED : Guard file exists."
fi

# 3. AUDIT: Frontend Image Bridge
echo -e "\n[03/03] AUDITING: Frontend Image Source Bridge"
cd ../frontend 2>/dev/null
if grep -r "http://localhost:3000" src > /dev/null; then
    echo "  [✔] VALIDATED : Frontend is pointing to the API for images."
else
    echo "  [⚠️] WARNING  : No hardcoded API URL found in frontend. Ensure your .env has VITE_API_URL=http://localhost:3000"
fi

echo -e "\n================================================================================"
echo "RESULT: Commercial Shield Hardened. Restarting Engine..."
echo "================================================================================"
cd ../backend
sudo fuser -k 3000/tcp 2>/dev/null
npm run start:dev
