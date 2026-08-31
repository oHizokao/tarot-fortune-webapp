const isProductionDeploy = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!isProductionDeploy) {
  console.log("Skipping production database migration for non-production Vercel build");
} else if (!String(process.env.DATABASE_URL || "").trim()) {
  console.error("DATABASE_URL is required for a production Vercel build");
  process.exit(1);
} else {
  await import("./migrate.mjs");
}
