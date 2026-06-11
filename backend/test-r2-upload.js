const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function testBucketAccess() {
  try {
    console.log('🔍 Testing bucket access...');
    console.log('Endpoint:', process.env.R2_ENDPOINT);
    console.log('Bucket:', process.env.R2_BUCKET_NAME);
    console.log('Access Key:', process.env.R2_ACCESS_KEY_ID?.substring(0, 8) + '...');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    // Test 1: Check if bucket exists
    console.log('\n📦 Test 1: HeadBucket...');
    try {
      const headCommand = new HeadBucketCommand({
        Bucket: process.env.R2_BUCKET_NAME,
      });
      await client.send(headCommand);
      console.log('✅ Bucket exists and is accessible!');
    } catch (headError) {
      console.log('⚠️  HeadBucket failed:', headError.name);
    }

    // Test 2: Try uploading a test file
    console.log('\n📤 Test 2: Upload test file...');
    const testContent = Buffer.from('FlowOps R2 Test - ' + new Date().toISOString());
    
    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: 'test/connection-test.txt',
      Body: testContent,
      ContentType: 'text/plain',
    });

    const result = await client.send(putCommand);
    console.log('✅ Upload successful!');
    console.log('ETag:', result.ETag);
    console.log('\n🎉 R2 connection is working perfectly!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.name);
    console.error('Message:', error.message);
    console.error('\n💡 Possible issues:');
    console.error('   1. Token might need 1-2 minutes to activate');
    console.error('   2. Check if token has "Object Read & Write" permission');
    console.error('   3. Verify bucket name matches exactly: flowops-pods');
  }
}

testBucketAccess();
