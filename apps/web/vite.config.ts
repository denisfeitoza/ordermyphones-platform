import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../../packages/shared-types/src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    preview: {
      port: 8080,
      host: true,
    },
    build: {
      target: 'es2022',
      sourcemap: env.VITE_SOURCEMAPS === 'true',
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
