import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'simulation-editor',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
