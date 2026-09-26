import { defineConfig } from 'vite';

// Na GitHub Pages aplikacja jest serwowana z podkatalogu /<repo>/ – ścieżka bazowa z env (CI ustawia VITE_BASE).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
});
