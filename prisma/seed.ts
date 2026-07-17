import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.setting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      cleaning_rate_bps: 1000,
      cleaning_cap_cents: 20000,
      tax_rate_bps: 1075,
      company_name: "YaoYuan Inc.",
    },
    update: {},
  });
  console.log("Settings ready.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
