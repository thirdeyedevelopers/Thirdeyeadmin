import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Thirdeyeadmin/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/app-check", "firebase/auth", "firebase/firestore", "firebase/functions"],
          charts: ["recharts"],
        },
      },
    },
  },
});
