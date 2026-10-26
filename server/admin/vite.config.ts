import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)),
  plugins:[react()],publicDir:false,
  build:{outDir:'../static',emptyOutDir:true,assetsDir:'admin-assets'},
});
