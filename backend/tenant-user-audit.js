const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function safe(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

async function main() {
  const lines = [];
  lines.push("FlowOps Tenant User Audit Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  const userModel = prisma.user;
  const companyModel = prisma.company;

  if (!userModel) {
    throw new Error("Prisma user model not found. Check generated Prisma client.");
  }

  const users = await userModel.findMany({
    orderBy: [
      { companyId: "asc" },
      { role: "asc" },
      { email: "asc" }
    ],
    include: companyModel ? {
      company: true
    } : undefined
  });

  lines.push("============================================================");
  lines.push("TOTAL USERS");
  lines.push("============================================================");
  lines.push(String(users.length));
  lines.push("");

  const tenantUsers = users.filter((u) => {
    const role = safe(u.role).toUpperCase();
    return role !== "SUPER_ADMIN" && role !== "OWNER" && role !== "ULTIMATE_OWNER";
  });

  lines.push("============================================================");
  lines.push("TENANT-SAFE USERS");
  lines.push("============================================================");
  lines.push(String(tenantUsers.length));
  lines.push("");

  const tenantAdmins = tenantUsers.filter((u) => {
    const role = safe(u.role).toUpperCase();
    return role === "TENANT_ADMIN" || role === "COMPANY_ADMIN" || role === "ADMIN";
  });

  lines.push("============================================================");
  lines.push("LIKELY TENANT ADMIN LOGIN USERS");
  lines.push("============================================================");

  if (!tenantAdmins.length) {
    lines.push("No tenant admin users found.");
  } else {
    for (const u of tenantAdmins) {
      lines.push(`ID: ${safe(u.id)}`);
      lines.push(`Email: ${safe(u.email)}`);
      lines.push(`Role: ${safe(u.role)}`);
      lines.push(`Company ID: ${safe(u.companyId)}`);
      lines.push(`Company: ${safe(u.company && u.company.name, "-")}`);
      lines.push(`Active: ${safe(u.isActive, "-")}`);
      lines.push(`Created: ${safe(u.createdAt, "-")}`);
      lines.push("------------------------------------------------------------");
    }
  }

  lines.push("");
  lines.push("============================================================");
  lines.push("ALL TENANT USERS");
  lines.push("============================================================");

  if (!tenantUsers.length) {
    lines.push("No tenant users found.");
  } else {
    for (const u of tenantUsers) {
      lines.push(`ID: ${safe(u.id)}`);
      lines.push(`Email: ${safe(u.email)}`);
      lines.push(`Role: ${safe(u.role)}`);
      lines.push(`Company ID: ${safe(u.companyId)}`);
      lines.push(`Company: ${safe(u.company && u.company.name, "-")}`);
      lines.push(`Active: ${safe(u.isActive, "-")}`);
      lines.push("------------------------------------------------------------");
    }
  }

  require("fs").writeFileSync(process.argv[2], lines.join("\r\n"), "utf8");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
