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

    // Create a user and list first
    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@example.com`,
        name: 'Test User'
      }
    });

    const list = await prisma.list.create({
      data: {
        name: 'Test List',
        ownerId: user.id
      }
    });

    // Create an item
    const item = await prisma.item.create({
      data: {
        name: 'Test Connection Item',
        status: 'PENDING',
        listId: list.id
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
    await prisma.list.delete({
      where: { id: list.id }
    });
    await prisma.user.delete({
      where: { id: user.id }
    });
  });

  test('can create triggers', async () => {
    // Skip the test if setup failed
    if (!prisma || !triggers) {
      console.warn('Skipping test: prisma or triggers not initialized');
      return;
    }

    // Create function first
    await triggers.transaction(async (tx) => {
      await tx`
        CREATE OR REPLACE FUNCTION test_verify_func()
        RETURNS TRIGGER AS $$
        BEGIN
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `;
    });

    // Create a trigger using the new API
    const trigger = triggers
      .for('item')
      .withName('test_verification_trigger')
      .after()
      .on('INSERT')
      .executeFunction('test_verify_func')
      .build();

    await trigger.setup();

    // Clean up - drop the trigger
    await trigger.drop();

    // Clean up function
    await triggers.transaction(async (tx) => {
      await tx`DROP FUNCTION IF EXISTS test_verify_func();`;
    });
  });
});