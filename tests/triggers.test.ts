// tests/trigger-crud.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications,
  pgClient,
  ensureDatabase,
  getDatabaseUrl
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';
import { createTriggers, TriggerManager, TriggerHandle } from '../src';

describe('CRUD Triggers', () => {
  let testItemId: string;
  let testItem: any;
  let testList: any;
  let testUser: any;
  let currentTriggerManager: TriggerManager<NonNullable<typeof prisma>> | null = null;
  let currentTrigger: TriggerHandle<NonNullable<typeof prisma>, any> | null = null;

  beforeEach(async () => {
    resetNotifications();

    // Ensure database is initialized
    const { prisma: db } = await ensureDatabase();
    
    // Create a test user first with unique email
    const uniqueEmail = `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}@example.com`;
    testUser = await db.user.create({
      data: {
        email: uniqueEmail,
        name: 'Test User'
      }
    });

    // Create a test list
    testList = await db.list.create({
      data: {
        name: 'Test List',
        ownerId: testUser.id
      }
    });

    // Create a test item for update/delete operations
    testItem = await db.item.create({
      data: {
        name: 'Test Item for CRUD',
        status: 'PENDING',
        listId: testList.id
      }
    });
    testItemId = testItem.id;
  });

  afterEach(async () => {
    // Remove any triggers created in tests
    if (currentTrigger) {
      try {
        await currentTrigger.drop();
      } catch (error) {
        // Ignore errors if trigger doesn't exist
      }
      currentTrigger = null;
    }

    // Dispose trigger manager
    if (currentTriggerManager) {
      try {
        await currentTriggerManager.dispose();
      } catch (error) {
        // Ignore errors
      }
      currentTriggerManager = null;
    }

    // Clear any remaining test data
    const { prisma: db } = await ensureDatabase();
    await db.item.deleteMany({});
    await db.list.deleteMany({});
  });

  describe('INSERT Triggers', () => {
    test('basic INSERT trigger should fire on item creation', async () => {
      // Create a FRESH TriggerManager for this test to avoid condition bleeding
      await ensureDatabase();
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION insert_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('insert_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_insert_trigger')
        .after()
        .on('INSERT')
        .executeFunction('insert_notify_func')
        .build();

      await currentTrigger.setup();

      // Create an item that should trigger the notification
      const item = await prisma!.item.create({
        data: {
          name: 'Test Insert Item',
          status: 'PENDING',
          listId: testList.id
        }
      });

      // Wait for the notification
      const received = await waitForNotifications('insert_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['insert_test'][0];
      assertNotificationPayload(notification, 'INSERT', {
        id: item.id,
        name: 'Test Insert Item',
        status: 'PENDING'
      });
    });

    test('conditional INSERT trigger should only fire when condition is met', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION insert_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('insert_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_insert_conditional_trigger')
        .after()
        .on('INSERT')
        .when((c) => c.NEW('status').eq('IN_PROGRESS'))
        .executeFunction('insert_notify_func')
        .build();

      await currentTrigger.setup();

      // Create an item with status 'PENDING' - should NOT trigger
      await prisma!.item.create({
        data: {
          name: 'Test Item Pending',
          status: 'PENDING',
          listId: testList.id
        }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['insert_test'].length).toBe(0);

      // Create an item with status 'IN_PROGRESS' - should trigger
      const activeItem = await prisma!.item.create({
        data: {
          name: 'Test Item Active',
          status: 'IN_PROGRESS',
          listId: testList.id
        }
      });

      // Wait for the notification
      const received = await waitForNotifications('insert_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['insert_test'][0];
      assertNotificationPayload(notification, 'INSERT', {
        id: activeItem.id,
        name: 'Test Item Active',
        status: 'IN_PROGRESS'
      });
    });

    test('INSERT trigger using raw SQL condition should work', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION insert_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('insert_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_insert_sql_trigger')
        .after()
        .on('INSERT')
        .when('NEW."name" LIKE \'Special%\'')
        .executeFunction('insert_notify_func')
        .build();

      await currentTrigger.setup();

      // Create an item that should NOT trigger (name doesn't match)
      await prisma!.item.create({
        data: {
          name: 'Regular Item',
          status: 'PENDING',
          listId: testList.id
        }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['insert_test'].length).toBe(0);

      // Create an item that should trigger (name matches pattern)
      const specialItem = await prisma!.item.create({
        data: {
          name: 'Special Item',
          status: 'PENDING',
          listId: testList.id
        }
      });

      // Wait for the notification
      const received = await waitForNotifications('insert_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['insert_test'][0];
      assertNotificationPayload(notification, 'INSERT', {
        id: specialItem.id,
        name: 'Special Item',
        status: 'PENDING'
      });
    });
  });

  describe('UPDATE Triggers', () => {
    test('basic UPDATE trigger should fire on any item update', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION update_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('update_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_update_trigger')
        .after()
        .on('UPDATE')
        .executeFunction('update_notify_func')
        .build();

      await currentTrigger.setup();

      // Update the test item
      const updatedItem = await prisma!.item.update({
        where: { id: testItemId },
        data: {
          name: 'Updated Item Name',
          status: 'COMPLETED'
        }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        name: 'Updated Item Name',
        status: 'COMPLETED'
      });
    });

    test('UPDATE trigger should only fire when watched column changes', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION update_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('update_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_update_watched_trigger')
        .after()
        .on('UPDATE')
        .watchColumns('status')
        .executeFunction('update_notify_func')
        .build();

      await currentTrigger.setup();

      // Update only the name - should NOT trigger
      await prisma!.item.update({
        where: { id: testItemId },
        data: { name: 'Updated Name Only' }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['update_test'].length).toBe(0);

      // Update the status - should trigger
      const updatedItem = await prisma!.item.update({
        where: { id: testItemId },
        data: { status: 'COMPLETED' }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        name: 'Updated Name Only', // Name from previous update
        status: 'COMPLETED' // New status
      });
    });

    test('conditional UPDATE trigger should only fire when condition is met', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION update_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('update_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_update_conditional_trigger')
        .after()
        .on('UPDATE')
        .when((c) => c.NEW('status').eq('IN_PROGRESS'))
        .executeFunction('update_notify_func')
        .build();

      await currentTrigger.setup();

      // Update to status 'completed' - should NOT trigger
      await prisma!.item.update({
        where: { id: testItemId },
        data: { status: 'COMPLETED' }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['update_test'].length).toBe(0);

      // Update to status 'IN_PROGRESS' - should trigger
      const updatedItem = await prisma!.item.update({
        where: { id: testItemId },
        data: { status: 'IN_PROGRESS' }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        status: 'IN_PROGRESS'
      });
    });

    test('UPDATE trigger with field comparison condition should work', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION update_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('update_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(NEW)
              )::text
            );
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_update_comparison_trigger')
        .after()
        .on('UPDATE')
        .when((c) => c.changed('status'))
        .executeFunction('update_notify_func')
        .build();

      await currentTrigger.setup();

      // Update only the name - should NOT trigger a status change
      await prisma!.item.update({
        where: { id: testItemId },
        data: { name: 'New Name Without Status Change' }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['update_test'].length).toBe(0);

      // Update the status - should trigger
      const updatedItem = await prisma!.item.update({
        where: { id: testItemId },
        data: { status: 'COMPLETED' }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        name: 'New Name Without Status Change',
        status: 'COMPLETED'
      });
    });
  });

  describe('DELETE Triggers', () => {
    test('basic DELETE trigger should fire on item deletion', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION delete_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('delete_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(OLD)
              )::text
            );
            RETURN OLD;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_delete_trigger')
        .after()
        .on('DELETE')
        .executeFunction('delete_notify_func')
        .build();

      await currentTrigger.setup();

      // Delete the test item
      await prisma!.item.delete({
        where: { id: testItemId }
      });

      // Wait for the notification
      const received = await waitForNotifications('delete_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['delete_test'][0];
      assertNotificationPayload(notification, 'DELETE', {
        id: testItemId,
        name: 'Test Item for CRUD',
        status: 'PENDING'
      });
    });

    test('conditional DELETE trigger should only fire when condition is met', async () => {
      // First, let's create two test items with different statuses
      const activeItem = await prisma!.item.create({
        data: {
          name: 'Active Item For Deletion',
          status: 'IN_PROGRESS',
          listId: testList.id
        }
      });

      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION delete_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('delete_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(OLD)
              )::text
            );
            RETURN OLD;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_delete_conditional_trigger')
        .after()
        .on('DELETE')
        .when((c) => c.OLD('status').eq('IN_PROGRESS'))
        .executeFunction('delete_notify_func')
        .build();

      await currentTrigger.setup();

      // Delete the pending item - should NOT trigger
      await prisma!.item.delete({
        where: { id: testItemId }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['delete_test'].length).toBe(0);

      // Delete the active item - should trigger
      await prisma!.item.delete({
        where: { id: activeItem.id }
      });

      // Wait for the notification
      const received = await waitForNotifications('delete_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['delete_test'][0];
      assertNotificationPayload(notification, 'DELETE', {
        id: activeItem.id,
        name: 'Active Item For Deletion',
        status: 'IN_PROGRESS'
      });
    });

    test('DELETE trigger with raw SQL condition should work', async () => {
      // Create another test item with a special name
      const specialItem = await prisma!.item.create({
        data: {
          name: 'Special Item For Deletion',
          status: 'PENDING',
          listId: testList.id
        }
      });

      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION delete_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            PERFORM pg_notify('delete_test', 
              json_build_object(
                'operation', TG_OP,
                'timestamp', NOW(),
                'data', row_to_json(OLD)
              )::text
            );
            RETURN OLD;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('item')
        .withName('test_delete_sql_trigger')
        .after()
        .on('DELETE')
        .when('OLD."name" LIKE \'Special%\'') // Use raw SQL condition with OLD only
        .executeFunction('delete_notify_func')
        .build();

      await currentTrigger.setup();

      // Delete the normal item - should NOT trigger
      await prisma!.item.delete({
        where: { id: testItemId }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['delete_test'].length).toBe(0);

      // Delete the special item - should trigger
      await prisma!.item.delete({
        where: { id: specialItem.id }
      });

      // Wait for the notification
      const received = await waitForNotifications('delete_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['delete_test'][0];
      assertNotificationPayload(notification, 'DELETE', {
        id: specialItem.id,
        name: 'Special Item For Deletion'
      });
    });
  });

  describe('Multi-Event Triggers', () => {
    test('trigger with multiple events should work for all operations', async () => {
      // Create a FRESH TriggerManager for this test
      currentTriggerManager = createTriggers<NonNullable<typeof prisma>>(
        getDatabaseUrl()
      );

      // Create function first
      await currentTriggerManager.transaction(async (tx) => {
        await tx`
          CREATE OR REPLACE FUNCTION condition_notify_func()
          RETURNS TRIGGER AS $$
          BEGIN
            IF TG_OP = 'DELETE' THEN
              PERFORM pg_notify('condition_test', 
                json_build_object(
                  'operation', TG_OP,
                  'timestamp', NOW(),
                  'data', row_to_json(OLD)
                )::text
              );
              RETURN OLD;
            ELSE
              PERFORM pg_notify('condition_test', 
                json_build_object(
                  'operation', TG_OP,
                  'timestamp', NOW(),
                  'data', row_to_json(NEW)
                )::text
              );
              RETURN NEW;
            END IF;
          END;
          $$ LANGUAGE plpgsql;
        `;
      });

      currentTrigger = currentTriggerManager
        .for('list')
        .withName('multi_event_trigger')
        .after()
        .on('INSERT', 'UPDATE', 'DELETE')
        .executeFunction('condition_notify_func')
        .build();

      await currentTrigger.setup();

      // Test INSERT
      const list = await prisma!.list.create({
        data: { 
          name: 'Multi-Event Test List',
          ownerId: testUser.id
        }
      });

      // Wait for the notification
      await waitForNotifications('condition_test', 1);
      expect(receivedNotifications['condition_test'].length).toBe(1);
      expect(receivedNotifications['condition_test'][0].operation).toBe(
        'INSERT'
      );

      // Test UPDATE
      await prisma!.list.update({
        where: { id: list.id },
        data: { name: 'Updated List Name' }
      });

      // Wait for the second notification
      await waitForNotifications('condition_test', 2);
      expect(receivedNotifications['condition_test'].length).toBe(2);
      expect(receivedNotifications['condition_test'][1].operation).toBe(
        'UPDATE'
      );

      // Test DELETE
      await prisma!.list.delete({
        where: { id: list.id }
      });

      // Wait for the third notification
      await waitForNotifications('condition_test', 3);
      expect(receivedNotifications['condition_test'].length).toBe(3);
      expect(receivedNotifications['condition_test'][2].operation).toBe(
        'DELETE'
      );
    });
  });
});