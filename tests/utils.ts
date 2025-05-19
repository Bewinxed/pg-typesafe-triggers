// tests/utils.ts
import { expect } from 'bun:test';
import { receivedNotifications } from './setup';

/**
 * Wait for a specific number of notifications on a channel
 */
export async function waitForNotifications(
  channel: string,
  count: number,
  timeout: number = 2000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (receivedNotifications[channel].length >= count) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Assert that a notification payload has expected properties
 */
export function assertNotificationPayload(
  payload: any,
  expectedOperation: string,
  expectedData: Record<string, any>
) {
  expect(payload).toBeDefined();
  expect(payload.operation).toBe(expectedOperation);
  expect(payload.timestamp).toBeDefined();

  // Check that each expected data property is present
  Object.entries(expectedData).forEach(([key, value]) => {
    if (value !== undefined) {
      expect(payload.data[key]).toBe(value);
    } else {
      expect(payload.data[key]).toBeDefined();
    }
  });
}

/**
 * Retry an async function until it succeeds or times out
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 500
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
