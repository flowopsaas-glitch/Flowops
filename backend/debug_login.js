const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

(async () => {
  console.log('🔍 STEP 1: Looking up user...');
  const user = await prisma.user.findUnique({ 
    where: { email: 'dispatcher@flowops.work' } 
  });
  
  if (!user) {
    console.log('❌ USER NOT FOUND IN DATABASE');
    process.exit(1);
  }
  
  console.log('✅ User found:', user.email, user.role);
  console.log('   Hash length:', user.password.length);
  console.log('   Hash starts with $2b$10$: ', user.password.startsWith('$2b$10$'));
  
  console.log('\n🔍 STEP 2: Testing bcrypt.compare...');
  const isValid = await bcrypt.compare('Dispatcher123!', user.password);
  console.log('   Result:', isValid ? '✅ MATCH' : '❌ NO MATCH');
  
  if (!isValid) {
    console.log('\n⚠️ BCRYPT MISMATCH DETECTED');
    console.log('   Likely causes:');
    console.log('   1. bcryptjs version incompatibility');
    console.log('   2. Password hashed with different salt rounds');
    console.log('   3. Database encoding issue');
  }
  
  await prisma.$disconnect();
})();
