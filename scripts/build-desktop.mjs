import { build } from "vite";
process.env.VITE_APP_EDITION = "desktop";
await build({ build: { outDir: "dist-desktop", emptyOutDir: true } });
