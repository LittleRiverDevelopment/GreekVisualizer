/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Project-site base. For a custom domain or a user-site root, change this to '/'.
export default defineConfig({
  base: '/GreekVisualizer/',
  plugins: [react(), tailwindcss()],
  build: {
    // Plotly's 3D bundle is one lazy chunk. It is larger than the app code on purpose.
    chunkSizeWarningLimit: 5000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
