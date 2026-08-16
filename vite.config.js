import { defineConfig } from 'vite';

// base: './' keeps every asset URL relative so the build still works once
// it is published under a subdirectory on the department LAMP server.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
});
