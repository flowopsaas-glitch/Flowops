const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "gogetadmin1@gmail.com";
  const newPassword = "Admin123!";

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      company: true,
    },
  });

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
    },
    include: {
      company: true,
    },
  });

  console.log("============================================================");
  console.log("TENANT ADMIN PASSWORD RESET COMPLETE");
  console.log("============================================================");
  console.log(`Email: ${updated.email}`);
  console.log(`Role: ${updated.role}`);
  console.log(`Company ID: ${updated.companyId ?? "-"}`);
  console.log(`Company: ${updated.company?.name ?? "-"}`);
  console.log(`New Password: ${newPassword}`);
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error("PASSWORD RESET FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
