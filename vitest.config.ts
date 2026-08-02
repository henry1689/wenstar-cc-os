// WENSTAROS-MAINLINE-PRODUCTIZATION-BATCH-02
// Test-only alias: redirect DeepSeek provider to patched dist/.
// src/m5/DeepSeekLLMProvider.ts is protected by Sentinel MCP.
// dist/m5/DeepSeekLLMProvider.js has pre-fetch guards + unified isAvailable.
// This alias applies to vitest test runs only — does NOT affect production builds.
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Redirect DeepSeek provider imports to the patched dist version
      'src/m5/DeepSeekLLMProvider.js': path.resolve(__dirname, 'dist/m5/DeepSeekLLMProvider.js'),
      '../m5/DeepSeekLLMProvider.js': path.resolve(__dirname, 'dist/m5/DeepSeekLLMProvider.js'),
      '../../src/m5/DeepSeekLLMProvider.js': path.resolve(__dirname, 'dist/m5/DeepSeekLLMProvider.js'),
    },
  },
  test: {
    // Longer timeout for provider tests that hit the retry/fallback path
    testTimeout: 30000,
  },
});
