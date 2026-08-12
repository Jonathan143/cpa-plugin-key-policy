import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const envDir = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, envDir, "VITE_");
  const cpaEnv = loadEnv(mode, envDir, "CPA_");

  // Shell variables take precedence over values from the project-root .env.
  const cpaBase = process.env.VITE_CPA_BASE ?? env.VITE_CPA_BASE ?? "http://127.0.0.1:8317";
  const hosted = process.env.VITE_HOSTED ?? env.VITE_HOSTED;
  const devSecretKey =
    command === "serve" ? (process.env.CPA_SECRET_KEY ?? cpaEnv.CPA_SECRET_KEY ?? "") : "";

  // When hosted inside CPA, the app is served at
  // /v0/resource/plugins/cpa-key-policy/index.html.
  const base = hosted === "1" ? "/v0/resource/plugins/cpa-key-policy/" : "/";

  return {
    envDir,
    // Make the root .env management key available only to the local dev
    // server. Production/hosted builds always receive an empty value so the
    // secret can never be embedded in the generated plugin HTML.
    define: {
      "import.meta.env.CPA_SECRET_KEY": JSON.stringify(devSecretKey),
    },
    plugins: [
      react(),
      tailwindcss(),
      // The plugin applies the Vite 8/Rolldown single-file build settings.
      // Its default base is "./", so restore the hosted/development base here.
      viteSingleFile({ overrideConfig: { base } }),
    ],
    server: {
      port: 5174,
      proxy: {
        // Proxy management API calls to CPA during development to avoid CORS.
        "/v0/management": { target: cpaBase, changeOrigin: true },
        "/v1/models": { target: cpaBase, changeOrigin: true },
      },
    },
  };
});
