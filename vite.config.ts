import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port '${value}'. Set MECHAFLOW_FRONTEND_PORT, FRONTEND_PORT, or PORT to a value from 1 to 65535.`);
  }
  return parsed;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = parsePort(env.MECHAFLOW_FRONTEND_PORT ?? env.FRONTEND_PORT ?? env.PORT, 5173);
  const host = env.MECHAFLOW_FRONTEND_HOST || env.FRONTEND_HOST || '127.0.0.1';

  return {
    plugins: [react()],
    server: {
      host,
      port,
      strictPort: true,
    },
    preview: {
      host,
      port,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      globals: true,
    },
  };
});
