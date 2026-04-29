import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Wipe any DOM and storage state between tests to avoid leakage.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
