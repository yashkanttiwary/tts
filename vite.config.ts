import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // This polyfills process.env.API_KEY for use in the browser,
    // assuming it is provided at build time (or by the environment).
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
});