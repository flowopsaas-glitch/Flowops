#!/bin/bash

echo "======================================"
echo "🔥 FINAL FLOW FIX (DISPATCH + CONTROLLERS)"
echo "======================================"

cd /opt/Flowops/backend || exit

pkill -f node || true

# -------------------------------------
# FIX COLLECTIONS SERVICE (FINAL)
# -------------------------------------

cat > src/collections/collections.service.ts << 'EOF'
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  async approve(id: number, userId?: number) {

    // 1. Update collection
    const collection = await this.prisma.collection.update({
      where: { id },
      data: {
        status: 'COMPLETED'
      },
    });

    // 2. CREATE DISPATCH (FIXED)
    await this.prisma.dispatch.create({
      data: {
        collectionId: collection.id,
        companyId: collection.companyId,
        createdById: userId ?? 1,
        status: 'PENDING',
      },
    });

    return collection;
  }

  async reject(id: number, reason?: string, userId?: number) {
    return this.prisma.collection.update({
      where: { id },
      data: {
        status: 'CANCELLED'
      },
    });
  }

  async autoApprove(id: number, userId?: number) {
    return this.approve(id, userId);
  }
}
EOF

# -------------------------------------
# CLEAN BUILD + RESTART
# -------------------------------------

rm -rf dist
npm run start:dev

echo "======================================"
echo "✅ FINAL FIX APPLIED"
echo "======================================"
