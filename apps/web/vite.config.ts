import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], server: { port: 5173, host: '127.0.0.1', strictPort: true, proxy: { '/api': 'http://localhost:4000', '/media': 'http://localhost:4000' } }, build: { target: 'es2022' } });
