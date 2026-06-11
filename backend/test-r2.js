const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

async function testConnection() {
  try {
    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new ListBucketsCommand({});
    const response = await client.send(command);
    
    console.log('✅ R2 connection successful!');
    console.log('📦 Available buckets:', response.Buckets?.map(b => b.Name).join(', ') || 'None');
    
    const bucketExists = response.Buckets?.some(b => b.Name === process.env.R2_BUCKET_NAME);
    if (bucketExists) {
      console.log(`✅ Bucket '${process.env.R2_BUCKET_NAME}' found!`);
    } else {
      console.log(`⚠️  Bucket '${process.env.R2_BUCKET_NAME}' not found.`);
    }
    
  } catch (error) {
    console.error('❌ R2 connection failed:', error.message);
  }
}

testConnection();
