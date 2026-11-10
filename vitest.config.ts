import { defineConfig } from 'vitest/config';

// One Vitest run over every workspace that has tests (each has its own vitest.config.ts).
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
