import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function portFromEnvironment():number{
  const raw=process.env.CRM_FRONTEND_PORT??process.env.VITE_PORT??'3000';const port=Number(raw);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error(`CRM_FRONTEND_PORT must be a valid TCP port, received: ${raw}`);
  return port;
}

const frontendPort=portFromEnvironment();
const backendTarget=process.env.CRM_BACKEND_URL??'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: false,
      },
      '/branding-assets': {
        target: backendTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          recharts: ['recharts'],
          lucide: ['lucide-react'],
        },
      },
    },
  },
});
