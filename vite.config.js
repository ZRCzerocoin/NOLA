import { defineConfig } from 'vite';

// Set base to the repo path for GitHub Pages if you deploy there.
// Update base to '/' if you deploy to root domain or you're not using GH pages.
export default defineConfig({
  base: '/NOLA/',
  server: {
    port: 5173
  }
});
