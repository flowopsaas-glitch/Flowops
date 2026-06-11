import { Queue } from 'bullmq';

// Connect explicitly to your active Redis cluster using the BullMQ structural engine
const emailQueue = new Queue('email-processing-queue', {
  connection: {
    host: '127.0.0.1',
    port: 6379,
  },
});

async function simulateInboundEmailJob() {
  console.log('🚀 Initializing Mock Inbound Waybill Email Simulation...');

  // Prepare a mock waybill text context containing your seeded tracking identifier string
  const mockWaybillPdfText = `
    ==================================================
    FLOWOPS SOUTHERN AFRICA LOGISTICS MANIFEST FREIGHT
    ==================================================
    WAYBILL IDENTIFIER REF: WB-GTR-ZA-001
    ORIGIN: Johannesburg Distribution Hub (JHB)
    DESTINATION: Cape Town Fulfillment Port (CPT)
    ==================================================
  `;

  // Encode the payload stream to base64 to match real mail attachment transfers safely
  const encodedBase64Attachment = Buffer.from(mockWaybillPdfText).toString('base64');

  const mockEmailJobPayload = {
    emailId: 'msg-za-jhb-789456',
    senderAddress: 'inbound-docs@flowop.work',
    subjectLine: 'Urgent Linehaul Attachment Document Sync - WB-GTR-ZA-001',
    bodyContext: 'Please process the attached digital manifest copy for immediate distribution hub dropoff.',
    companyId: 1,
    attachmentsArray: [
      {
        fileName: 'waybill_manifest_export_001.txt',
        fileBufferBase64: encodedBase64Attachment,
        mimeType: 'text/plain',
      },
    ],
  };

  try {
    console.log('📦 Injecting mock email payload data structural packet into Redis queue...');
    
    // Add the job using the structural naming parameters your NestJS worker expects
    const jobInstance = await emailQueue.add('parse-inbound-packet', mockEmailJobPayload, {
      attempts: 3,
      backoff: 5000,
    });
    
    console.log(`✅ Job safely allocated inside Redis cluster. Assignment Identifier: [ID: ${jobInstance.id}]`);
    console.log('⏳ Waiting 3 seconds for asynchronous worker consumption pass to resolve...');
    
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log('🎉 Execution injection pass finalized safely.');
  } catch (error) {
    console.error('❌ Queuing Failure Intercepted:', error);
  } finally {
    await emailQueue.close();
    process.exit(0);
  }
}

simulateInboundEmailJob();

