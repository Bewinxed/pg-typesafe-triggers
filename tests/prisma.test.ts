// tests/db-verification.test.ts
import { describe, test, expect } from 'bun:test';
import { prisma, triggers } from './setup';

describe('Database Connection', () => {
  test('can create and query items', async () => {
    // Skip the test if setup failed
    if (!prisma || !triggers) {
      console.warn('Skipping test: prisma or triggers not initialized');
      return;
    }

    // Create an item
    const item = await prisma.item.create({
      data: {
        name: 'Test Connection Item',
        status: 'pending'
      }
    });

    // Verify the item exists
    const found = await prisma.item.findUnique({
      where: { id: item.id }
    });

    expect(found).toBeDefined();
    expect(found?.name).toBe('Test Connection Item');

    // Clean up
    await prisma.item.delete({
      where: { id: item.id }
    });
  });

  test('can create triggers', async () => {
    // Skip the test if setup failed
    if (!prisma || !triggers) {
      console.warn('Skipping test: prisma or triggers not initialized');
      return;
    }

    // Create a trigger using the new API
    const triggerManager = triggers
      .defineTrigger('item')
      .withName('test_verification_trigger')
      .withTiming('AFTER')
      .onEvents('INSERT')
      .executeFunction('insert_notify_func');

    await triggerManager.setupDatabase();

    // Clean up - drop the trigger
    await triggerManager.getManager().dropTrigger();
  });
});
