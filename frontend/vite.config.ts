import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [react(), tailwindcss()], server: { port: Number(process.env.WEB_PORT??5173), host: '127.0.0.1', strictPort: true, proxy: { '/api': process.env.API_PROXY_TARGET??'http://localhost:4000', '/media': process.env.API_PROXY_TARGET??'http://localhost:4000' } }, build: { target: 'es2022' } });
