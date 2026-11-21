import { defineConfig, type Connect } from 'vite';
import react from '@vitejs/plugin-react';

const serveLaunch: Connect.NextHandleFunction = (request, _response, next) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/launch' || url.pathname === '/launch/') request.url = '/launch/index.html' + url.search;
  next();
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'launch-directory',
      configureServer: server => { server.middlewares.use(serveLaunch); },
      configurePreviewServer: server => { server.middlewares.use(serveLaunch); },
    },
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:7071', changeOrigin: true } },
  },
});
