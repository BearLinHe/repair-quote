import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.setting.count();
  if (count === 0) {
    await prisma.setting.create({
      data: {
        cleaning_rate_bps: 1000,
        cleaning_cap_cents: 20000,
        tax_rate_bps: 1075,
        company_name: "YaoYuan Inc.",
      },
    });
    console.log("Settings seeded.");
  } else {
    console.log("Settings already exist, skip seed.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
