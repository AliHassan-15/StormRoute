import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type Plugin } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const analyze = process.env.npm_lifecycle_event === "build:analyze";

/** Emit a gzip size report for the TEST REPORT after build. */
function bundleReportPlugin(): Plugin {
  return {
    name: "stormroute-bundle-report",
    apply: "build",
    closeBundle: {
      order: "post",
      async handler() {
        const { gzipSync } = await import("node:zlib");
        const { readdirSync, readFileSync, writeFileSync, existsSync } =
          await import("node:fs");
        const assetsDir = path.resolve(rootDir, "dist/assets");
        if (!existsSync(assetsDir)) return;
        const rows: { file: string; raw: number; gzip: number }[] = [];
        for (const fileName of readdirSync(assetsDir)) {
          if (!fileName.endsWith(".js") && !fileName.endsWith(".css")) continue;
          const buf = readFileSync(path.join(assetsDir, fileName));
          rows.push({
            file: `assets/${fileName}`,
            raw: buf.length,
            gzip: gzipSync(buf).length,
          });
        }
        rows.sort((a, b) => b.gzip - a.gzip);
        const report = {
          generatedAt: new Date().toISOString(),
          chunks: rows.map((r) => ({
            file: r.file,
            rawKb: Number((r.raw / 1024).toFixed(2)),
            gzipKb: Number((r.gzip / 1024).toFixed(2)),
          })),
          initialJsGzipKbExcludingMapbox: Number(
            (
              rows
                .filter((r) => {
                  if (!r.file.endsWith(".js")) return false;
                  const name = r.file.toLowerCase();
                  // Exclude async/lazy chunks and Mapbox.
                  if (name.includes("mapbox")) return false;
                  if (name.includes("designsystem")) return false;
                  if (name.includes("heatmap")) return false;
                  if (name.includes("checkpoint")) return false;
                  return true;
                })
                .reduce((sum, r) => sum + r.gzip, 0) / 1024
            ).toFixed(2),
          ),
        };
        writeFileSync(
          path.resolve(rootDir, "dist/bundle-report.json"),
          JSON.stringify(report, null, 2),
        );
        // eslint-disable-next-line no-console -- build report
        console.log("\n[StormRoute] Bundle gzip sizes (KB):");
        for (const row of report.chunks.slice(0, 12)) {
          // eslint-disable-next-line no-console -- build report
          console.log(`  ${row.gzipKb.toString().padStart(7)}  ${row.file}`);
        }
        // eslint-disable-next-line no-console -- build report
        console.log(
          `  initial JS (excl. Mapbox): ${report.initialJsGzipKbExcludingMapbox} KB`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    bundleReportPlugin(),
    analyze
      ? visualizer({
          filename: "dist/stats.html",
          gzipSize: true,
          brotliSize: true,
          open: false,
        })
      : undefined,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  build: {
    target: "es2022",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep Mapbox in its own async chunk; leave the rest for the entry so
          // initial JS (excl. Mapbox) stays under the 250 KB gzip budget.
          if (id.includes("node_modules/mapbox-gl")) return "mapbox";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: true,
    exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.d.ts", "src/main.tsx"],
    },
  },
});

