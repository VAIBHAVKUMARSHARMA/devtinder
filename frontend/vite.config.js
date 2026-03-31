import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"

const srcPath = fileURLToPath(new URL("./src", import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(srcPath),
    },
  },
})
