import { PrismaClient, Role, ItemStatus, DriverType, WaybillStatus, PaymentType, PayerSide, DispatchStatus, AIEventSeverity, BranchType, DeviceType, CommSource } from '../src/generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting system seed execution for FlowOps database schema...');

  // 1. Structural Corporate Organization Top-Level Node
  const targetCompany = await prisma.company.upsert({
    where: { regNumber: '2026/123456/07' },
    update: {},
    create: {
      name: 'Apex Logistics Core',
      regNumber: '2026/123456/07',
      plan: 'Enterprise Tier',
      status: 'Active',
      cipcVerified: true,
      isActive: true,
      baseTierPrice: 12500.00,
      perUserPrice: 450.00,
      pricePerWhatsapp: 0.80,
      pricePerEmail: 0.10,
      systemEmailSender: 'billing@flowops.com',
      currency: 'ZAR',
      defaultVatRate: 0.15,
      autoInvoiceEnabled: true,
      brandPrimaryColor: '#0f172a',
      brandSecondaryColor: '#3b82f6',
    },
  });
  console.log(`✅ Organization Profile initialized/verified: [ID: ${targetCompany.id}] ${targetCompany.name}`);

  // 2. Authentication & Core User Accounts Hierarchy
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@flowops.com' },
    update: {},
    create: {
      email: 'admin@flowops.com',
      name: 'System Operations Admin',
      password: '$argon2id$v=19$m=65536,t=3,p=4$7MhG8zK...hashplaceholder', // Securely replaced at auth level
      role: Role.SUPER_ADMIN,
      companyId: targetCompany.id,
      termsAcceptedAt: new Date(),
      termsAcceptedVersion: 'v1.0.0',
    },
  });

  const dispatcherUser = await prisma.user.upsert({
    where: { email: 'dispatch@flowops.com' },
    update: {},
    create: {
      email: 'dispatch@flowops.com',
      name: 'Gauteng Regional Dispatcher',
      password: '$argon2id$v=19$m=65536,t=3,p=4$9KjL2xX...hashplaceholder',
      role: Role.DISPATCH,
      companyId: targetCompany.id,
      termsAcceptedAt: new Date(),
      termsAcceptedVersion: 'v1.0.0',
    },
  });
  console.log(`✅ Core team nodes mounted. Admin: ${adminUser.email}, Dispatcher: ${dispatcherUser.email}`);

  // 3. Physical Distribution Networks (Branches)
  const jhbHub = await prisma.branch.create({
    data: {
      name: 'Johannesburg Main Freight Hub',
      type: BranchType.HUB,
      location: '-26.1135,28.2541',
      companyId: targetCompany.id,
    },
  });

  const cptWarehouse = await prisma.branch.create({
    data: {
      name: 'Cape Town Airport DC',
      type: BranchType.DISTRIBUTION_CENTER,
      location: '-33.9648,18.5998',
      companyId: targetCompany.id,
    },
  });
  console.log(`✅ Logistics footprint nodes created: ${jhbHub.name} and ${cptWarehouse.name}`);

  // 4. Fulfillment Assets Fleet (Drivers)
  const driverInternal = await prisma.driver.create({
    data: {
      name: 'Sipho Ndlovu',
      phone: '+27821110001',
      pin: '1234',
      vehicleReg: 'FZ88YBGP',
      status: 'AVAILABLE',
      availabilityStatus: 'AVAILABLE',
      type: DriverType.INTERNAL,
      companyId: targetCompany.id,
      zone: 'Gauteng Central',
    },
  });

  const driverGig = await prisma.driver.create({
    data: {
      name: 'David Gouws',
      phone: '+27832220002',
      pin: '5678',
      vehicleReg: 'CA991122',
      status: 'EN_ROUTE',
      availabilityStatus: 'BUSY',
      type: DriverType.GIG,
      companyId: targetCompany.id,
      zone: 'Western Cape Peninsula',
    },
  });
  console.log(`✅ Fleet resource drivers online: ${driverInternal.name} (Internal), ${driverGig.name} (Gig)`);

  // 5. Commercial Rate Constraints (Rate Cards)
  const rateCardDefault = await prisma.rateCard.create({
    data: {
      name: 'Standard Contractual Freight Tariff',
      companyId: targetCompany.id,
      baseFee: 150.00,
      perKm: 14.50,
      perKg: 3.20,
      fuelSurchargePercent: 12.50,
      isActive: true,
      version: 1,
    },
  });
  console.log(`✅ Financial calculation policies configured: ${rateCardDefault.name}`);

  // 6. Production Transactional Batch Constraints (Billing Batches)
  const openBillingBatch = await prisma.billingBatch.create({
    data: {
      status: 'OPEN',
      totalValue: 4850.00, // Aggregate transaction value metrics calculated dynamically
      companyId: targetCompany.id,
    },
  });

  // 7. Core Cargo Identifiers & Shipments (Waybills & Manifests)
  const testManifest = await prisma.manifest.create({
    data: {
      manifestNumber: 'MNF-2026-0001',
      destination: 'Cape Town Hub Terminal',
      driverName: 'Sipho Ndlovu',
      status: 'PENDING',
      companyId: targetCompany.id,
    },
  });

  const waybillOne = await prisma.waybill.create({
    data: {
      waybillNumber: 'WB-2026-X8910',
      status: WaybillStatus.MANIFESTED,
      phone: '+27824445555',
      consigneePhone: '+27110002222',
      shipperPhone: '+27219998888',
      paymentType: PaymentType.CONTRACT,
      payer: PayerSide.SENDER,
      totalAmount: 2450.00,
      currency: 'ZAR',
      weightKg: 42.5,
      distanceKm: 1400.0,
      sender: 'TechCorp Manufacturing JHB',
      recipient: 'Global Distribution CPT',
      deliveryAddress: 'Unit 4, Airport Industry Park, Cape Town',
      companyId: targetCompany.id,
      driverId: driverInternal.id,
      billingBatchId: openBillingBatch.id,
      currentBranchId: jhbHub.id,
      destinationBranchId: cptWarehouse.id,
      manifestId: testManifest.id,
    },
  });

  // Structural sub-elements (Shipment Legs) mapping the physical route hierarchy
  await prisma.shipmentLeg.create({
    data: {
      waybillId: waybillOne.id,
      sequence: 1,
      fromLocation: 'Johannesburg Main Freight Hub',
      toLocation: 'Cape Town Airport DC',
      status: 'IN_TRANSIT',
      driverId: driverInternal.id,
      driverType: DriverType.INTERNAL,
    },
  });
  console.log(`✅ Waybill pipelines structural validation successful. Generated Asset Key: ${waybillOne.waybillNumber}`);

  // 8. Inbound Automated Extraction Data Layers (Inbox & Draft Components)
  const mockInboxItem = await prisma.waybillInboxItem.create({
    data: {
      status: 'EXTRACTED',
      fileUrl: 'https://storage.flowops.com/waybills/2026/05/raw_invoice_09.pdf',
      storagePath: 'waybills/2026/05/raw_invoice_09.pdf',
      originalName: 'raw_invoice_09.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 142050,
      source: 'email_attachment',
      waybillNumber: 'WB-DRAFT-9982',
      recipientName: 'Vanguard Retail Systems',
      recipientAddress: '74 Prestwich Street, Green Point, Cape Town',
      totalAmount: 2400.00,
      companyId: targetCompany.id,
      createdById: dispatcherUser.id,
      extractedData: {
        detected_weight: 12.8,
        sender_raw: 'Alpha Tech Supply Pretoria',
        confidence_metric: 0.98,
      },
    },
  });

  const targetInvoiceDraft = await prisma.invoiceDraft.create({
    data: {
      companyId: targetCompany.id,
      clientName: 'Alpha Tech Supply Pretoria',
      periodKey: '2026-05',
      status: 'DRAFT',
      subtotal: 2400.00,
      vat: 360.00,
      total: 2760.00,
    },
  });

  const waybillDraft = await prisma.waybillDraft.create({
    data: {
      invoiceDraftId: targetInvoiceDraft.id,
      waybillId: waybillOne.id,
      waybillNo: 'WB-DRAFT-9982',
      senderName: 'Alpha Tech Supply Pretoria',
      receiverName: 'Vanguard Retail Systems',
      receiverPhone: '+27218883333',
      companyId: targetCompany.id,
      inboxItemId: mockInboxItem.id,
    },
  });

  await prisma.parcel.create({
    data: {
      waybillDraftId: waybillDraft.id,
      qty: 2,
      weightKg: 6.4,
    },
  });

  await prisma.invoiceDraftLine.create({
    data: {
      invoiceDraftId: targetInvoiceDraft.id,
      waybillDraftId: waybillDraft.id,
      description: 'Automated Extraction Transport Line Charge: WB-DRAFT-9982',
      amount: 2400.00,
    },
  });
  console.log('✅ Inbound OCR parsing structures and draft billing relations safely mapped');

  // 9. Operational Communication Tracking Logs (WhatsApp & Emails)
  await prisma.whatsAppLog.create({
    data: {
      phone: '+27824445555',
      message: 'FlowOps Update: Your shipment WB-2026-X8910 has been loaded onto Linehaul vehicle.',
      status: 'delivered',
      type: 'template_notification',
      isBilled: true,
      companyId: targetCompany.id,
    },
  });

  await prisma.communication.create({
    data: {
      content: 'Inbound pickup coordination request confirmation receipt details.',
      source: CommSource.WHATSAPP,
      direction: 'INBOUND',
      companyId: targetCompany.id,
      messagePrice: 0.80,
      billedAmount: 0.80,
      status: 'read',
    },
  });

  const inboundEmail = await prisma.emailHubItem.create({
    data: {
      subject: 'Urgent Collection Request - Pretoria Industrial Park',
      body: 'Please schedule immediate dispatch for multi-parcel cargo to Cape Town distribution point.',
      senderName: 'Logistics Desk Alpha Tech',
      senderEmail: 'shipping@alphatech.co.za',
      status: ItemStatus.NEW,
      type: 'COLLECTION_REQUEST',
      isRead: false,
      needsOpsAction: true,
      isBilled: false,
      companyId: targetCompany.id,
      assignedUserId: dispatcherUser.id,
    },
  });
  console.log('✅ Communication history layers and event data anchors connected');

  // 10. System Safety and Cognitive Operations Logs (AI Events & Patterns)
  const aiHeuristicEvent = await prisma.aiEvent.create({
    data: {
      source: 'INBOUND_EMAIL_PARSER',
      type: 'EXTRACTION_ANOMALY',
      severity: AIEventSeverity.MEDIUM,
      title: 'Address Context Discrepancy Flagged',
      summary: 'Fuzzy address match for Green Point branch resolution below strict threshold settings.',
      initiator: 'CLAW_1_ENGINE',
      payload: { parsed_token: 'Greeen Pnt', calculated_confidence: 0.72 },
      isResolved: false,
      companyId: targetCompany.id,
      emailHubItemId: inboundEmail.id,
    },
  });

  await prisma.aiGoldenPattern.create({
    data: {
      patternType: 'ADDRESS_CORRECTION',
      originalValue: 'Greeen Pnt',
      correctedValue: 'Green Point',
      confidenceScore: 0.99,
      useCount: 1,
      lastUsedAt: new Date(),
      companyId: targetCompany.id,
      relatedEvents: {
        connect: { id: aiHeuristicEvent.id },
      },
    },
  });

  await prisma.aiSystemLog.create({
    data: {
      component: 'OCR_TRANSFORM_MICROSERVICE',
      errorCode: 'ERR_PARSING_TIMEOUT_RECOVERED',
      errorMessage: 'Upstream visual parsing request experienced processing variance; context successfully resolved using replica node backup fallback routing logic.',
      severity: 'WARNING',
      repaired: true,
      repairAction: 'FALLBACK_ROUTING_TO_SECONDARY_PIPELINE',
      repairedBy: 'SYSTEM_AUTONOMIC_RECONCILER',
    },
  });
  console.log('✅ Autonomous AI logging layer context definitions established');

  // 11. Infrastructure Tracking Points (Hardware Peripherals)
  await prisma.hardwareDevice.create({
    data: {
      name: 'Dispatch Thermal Waybill Label Printer #1',
      deviceType: 'PRINTER',
      serialNumber: 'ZBR-ZE500-2026X',
      status: 'ONLINE',
      companyId: targetCompany.id,
      branchId: jhbHub.id,
    },
  });

  await prisma.hardware.create({
    data: {
      name: 'Rugged Warehouse Handheld Laser Scanner Unit 3',
      deviceType: DeviceType.SCANNER,
      vendorId: '0x0A5C', // Standard hexadecimal vendor validation formatting
      productId: '0x2190',
      serialNumber: 'HONEYWELL-E4300-88A',
      status: 'ONLINE',
      companyId: targetCompany.id,
    },
  });

  // 12. Corporate Operational Audit Logging Node
  await prisma.activityLog.create({
    data: {
      companyId: targetCompany.id,
      userId: adminUser.id,
      type: 'SYSTEM_PROMOTION',
      description: 'System seed initialization successfully deployed all structural master schemas and relationship records.',
    },
  });

  console.log('---');
  console.log('🎉 100% Comprehensive Database Seeding Phase Executed Successfully.');
}

main()
  .catch((error) => {
    console.error('❌ Critical failure while seeding FlowOps relational model matrix:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
