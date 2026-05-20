const fs = require("fs");
const path = require("path");

const pages = [
  "dashboard",
  "customer-portal",
  "track-shipment",
  "driver-app",
  "whatsapp-hub",
  "production-processes",
  "capacity-planning",
  "mrp-system",
  "location-analysis",
  "carriers",
  "waybills",
  "clients",
  "live-tracking",
  "route-optimizer",
  "stock",
  "drivers",
  "routes",
  "driver-requests",
  "deliveries",
  "quotes",
  "invoices",
];

const appDir = path.join(process.cwd(), "src", "app");

pages.forEach((page) => {
  const dir = path.join(appDir, page);
  const file = path.join(dir, "page.tsx");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(file)) {
    const componentName = page
      .split("-")
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join("");

    fs.writeFileSync(
      file,
      `export default function ${componentName}Page() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold capitalize">
        ${page.replace(/-/g, " ")}
      </h1>
      <p className="text-muted-foreground mt-2">
        This page is under construction.
      </p>
    </div>
  );
}
`
    );
  }
});

console.log("✅ Pages generated successfully");
