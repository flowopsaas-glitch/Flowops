import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriverAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: any) {
    const companyId = Number(user?.companyId);
    if (!companyId) {
      return {
        now: new Date().toISOString(),
        closingHourLocal: 17,
        minutesToClose: null,
        pendingCount: 0,
        pendingCollections: [],
        prompts: [
          {
            level: 'WARNING',
            title: 'No company context',
            message: 'Your token has no companyId. Login as a company user (e.g., admin@flowops.com).',
            actions: [],
          },
        ],
      };
    }

    // Closing time logic (default 17:00 local)
    const closingHourLocal = 17;
    const now = new Date();
    const hour = now.getHours();
    const minutesToClose = (closingHourLocal - hour) * 60 - now.getMinutes();

    // NOTE: Adjust this query if you later add driverId relation on Collection.
    const pendingCollections = await (this.prisma as any).collection.findMany({
      where: { companyId, status: 'PENDING' as any },
      select: { id: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const prompts: any[] = [];

    if (pendingCollections.length > 0) {
      prompts.push({
        level: 'INFO',
        title: 'Pending collections require updates',
        message: `You have ${pendingCollections.length} pending collections. Open each one, update status, then upload parcels + PODs.`,
        actions: [
          { label: 'Open first pending', type: 'OPEN_COLLECTION', payload: { id: pendingCollections[0].id } },
          { label: 'Upload parcels + PODs', type: 'UPLOAD_PODS' },
        ],
      });

      // We don’t yet have a real “uploads” table in your schema, so we always remind.
      prompts.push({
        level: 'WARNING',
        title: 'Missing POD // parcels uploads',
        message: `${pendingCollections.length} pending collections may block invoicing until parcels + PODs are uploaded.`,
        actions: [
          { label: 'Upload parcels list', type: 'UPLOAD_PARCELS' },
          { label: 'Upload POD photos', type: 'UPLOAD_PODS' },
        ],
      });
    } else {
      prompts.push({
        level: 'SUCCESS',
        title: 'All clear',
        message: 'No pending collections right now.',
        actions: [],
      });
    }

    // 1 hour before closing → route urgency prompt
    if (minutesToClose !== null && minutesToClose <= 60 && minutesToClose > 0) {
      prompts.push({
        level: 'WARNING',
        title: 'Closing soon — prioritize quick routes',
        message: `Closing in ~${minutesToClose} minutes. Focus on nearby stops and avoid long detours. Confirm any pending collections now.`,
        actions: [{ label: 'Show quick route advice', type: 'SHOW_ROUTE_ADVICE' }],
      });
    }

    // After closing → enforce uploads
    if (minutesToClose !== null && minutesToClose <= 0) {
      prompts.push({
        level: 'DANGER',
        title: 'After hours — complete uploads',
        message: 'Please upload all collected parcels + PODs now to ensure invoicing can be created.',
        actions: [
          { label: 'Upload parcels list', type: 'UPLOAD_PARCELS' },
          { label: 'Upload POD photos', type: 'UPLOAD_PODS' },
        ],
      });
    }

    return {
      now: now.toISOString(),
      closingHourLocal,
      minutesToClose,
      pendingCount: pendingCollections.length,
      pendingCollections,
      prompts,
    };
  }
}