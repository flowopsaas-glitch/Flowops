import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    console.log('🔄 Attempting to reset admin credentials...');
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Try to find and update admin by email
    const updated = await prisma.user.updateMany({
      where: { 
        OR: [
          { email: 'admin@flowops.com' },
          { email: 'admin@alpha.com' },
          { role: 'SUPER_ADMIN' }
        ]
      },
      data: { password: hashedPassword },
    });
    
    if (updated.count > 0) {
      console.log(`✅ Reset ${updated.count} admin user(s) to: admin@flowops.com / password123`);
      
      // Try to find the admin user to confirm
      const admin = await prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
        select: { id: true, email: true, role: true }
      });
      
      if (admin) {
        console.log(`   User ID: ${admin.id}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Role: ${admin.role}`);
      }
    } else {
      console.log('⚠️  No SUPER_ADMIN users found. Checking all users...');
      
      const allUsers = await prisma.user.findMany({
        select: { id: true, email: true, role: true },
        take: 5
      });
      
      if (allUsers.length > 0) {
        console.log('📋 Found users:');
        allUsers.forEach(u => {
          console.log(`   - ${u.email} (${u.role})`);
        });
      } else {
        console.log('❌ No users found in database. Database might be empty.');
      }
    }
  } catch (error) {
    console.error('❌ Error resetting credentials:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();
