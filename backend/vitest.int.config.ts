import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.int.test.ts'], fileParallelism: false },
});