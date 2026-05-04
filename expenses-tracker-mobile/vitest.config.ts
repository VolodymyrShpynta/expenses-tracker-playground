/**
 * Vitest configuration for the mobile module.
 *
 * Scope: pure-TypeScript code only (domain types, projector, sync engine,
 * cloud-drive adapters with HTTP mocked). React Native components are NOT
 * tested here — that requires `jest-expo`, which we will add in Phase 4.
 *
 * The mobile architecture deliberately keeps domain and sync code free of
 * React Native imports so it can be unit-tested under Node + Vitest with
 * an in-memory `LocalStore` and an in-memory `CloudDriveAdapter`. This is
 * the same DIP approach used in the backend (`ExpenseSyncProjector` is
 * tested without Spring DI).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'app', '.expo'],
  },
});
