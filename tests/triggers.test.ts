// tests/trigger-crud.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  prisma,
  triggers,
  receivedNotifications,
  resetNotifications,
  pgClient
} from './setup';
import { waitForNotifications, assertNotificationPayload } from './utils';
import { TriggerManager } from '../src/trigger/manager';

describe('CRUD Triggers', () => {
  let testItemId: string;
  let testItem: any;
  let currentTriggerManager: any = null;

  beforeEach(async () => {
    resetNotifications();

    // Create a test item for update/delete operations
    testItem = await prisma!.item.create({
      data: {
        name: 'Test Item for CRUD',
        status: 'pending'
      }
    });
    testItemId = testItem.id;
  });

  afterEach(async () => {
    // Remove any triggers created in tests
    if (currentTriggerManager) {
      try {
        await currentTriggerManager.getManager().dropTrigger();
      } catch (error) {
        // Ignore errors if trigger doesn't exist
      }
      currentTriggerManager = null;
    }

    // Clear any remaining test data
    await prisma!.item.deleteMany({});
    await prisma!.list.deleteMany({});
  });

  describe('INSERT Triggers', () => {
    test('basic INSERT trigger should fire on item creation', async () => {
      // Create a FRESH TriggerManager for this test to avoid condition bleeding
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_insert_trigger')
        .withTiming('AFTER')
        .onEvents('INSERT')
        .executeFunction('insert_notify_func');

      await currentTriggerManager.setupDatabase();

      // Create an item that should trigger the notification
      const item = await prisma!.item.create({
        data: {
          name: 'Test Insert Item',
          status: 'pending'
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
        status: 'pending'
      });
    });

    test('conditional INSERT trigger should only fire when condition is met', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_insert_conditional_trigger')
        .withTiming('AFTER')
        .onEvents('INSERT')
        .withCondition(({ NEW }) => NEW.status === 'active')
        .executeFunction('insert_notify_func');

      await currentTriggerManager.setupDatabase();

      // Create an item with status 'pending' - should NOT trigger
      await prisma!.item.create({
        data: {
          name: 'Test Item Pending',
          status: 'pending'
        }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['insert_test'].length).toBe(0);

      // Create an item with status 'active' - should trigger
      const activeItem = await prisma!.item.create({
        data: {
          name: 'Test Item Active',
          status: 'active'
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
        status: 'active'
      });
    });

    test('INSERT trigger using raw SQL condition should work', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_insert_sql_trigger')
        .withTiming('AFTER')
        .onEvents('INSERT')
        .withCondition('NEW."name" LIKE \'Special%\'')
        .executeFunction('insert_notify_func');

      await currentTriggerManager.setupDatabase();

      // Create an item that should NOT trigger (name doesn't match)
      await prisma!.item.create({
        data: {
          name: 'Regular Item',
          status: 'pending'
        }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['insert_test'].length).toBe(0);

      // Create an item that should trigger (name matches pattern)
      const specialItem = await prisma!.item.create({
        data: {
          name: 'Special Item',
          status: 'pending'
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
        status: 'pending'
      });
    });
  });

  describe('UPDATE Triggers', () => {
    test('basic UPDATE trigger should fire on any item update', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_update_trigger')
        .withTiming('AFTER')
        .onEvents('UPDATE')
        .executeFunction('update_notify_func');

      await currentTriggerManager.setupDatabase();

      // Update the test item
      const updatedItem = await prisma!.item.update({
        where: { id: testItemId },
        data: {
          name: 'Updated Item Name',
          status: 'completed'
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
        status: 'completed'
      });
    });

    test('UPDATE trigger should only fire when watched column changes', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_update_watched_trigger')
        .withTiming('AFTER')
        .onEvents('UPDATE')
        .watchColumns('status')
        .executeFunction('update_notify_func');

      await currentTriggerManager.setupDatabase();

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
        data: { status: 'completed' }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        name: 'Updated Name Only', // Name from previous update
        status: 'completed' // New status
      });
    });

    test('conditional UPDATE trigger should only fire when condition is met', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_update_conditional_trigger')
        .withTiming('AFTER')
        .onEvents('UPDATE')
        .withCondition(({ NEW }) => NEW.status === 'active')
        .executeFunction('update_notify_func');

      await currentTriggerManager.setupDatabase();

      // Update to status 'completed' - should NOT trigger
      await prisma!.item.update({
        where: { id: testItemId },
        data: { status: 'completed' }
      });

      // Wait a moment to ensure no notification is fired
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(receivedNotifications['update_test'].length).toBe(0);

      // Update to status 'active' - should trigger
      const updatedItem = await prisma!.item.update({
        where: { id: testItemId },
        data: { status: 'active' }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        status: 'active'
      });
    });

    test('UPDATE trigger with field comparison condition should work', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_update_comparison_trigger')
        .withTiming('AFTER')
        .onEvents('UPDATE')
        .withCondition(({ OLD, NEW }) => OLD.status !== NEW.status)
        .executeFunction('update_notify_func');

      await currentTriggerManager.setupDatabase();

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
        data: { status: 'completed' }
      });

      // Wait for the notification
      const received = await waitForNotifications('update_test', 1);
      expect(received).toBe(true);

      // Verify the notification payload
      const notification = receivedNotifications['update_test'][0];
      assertNotificationPayload(notification, 'UPDATE', {
        id: updatedItem.id,
        name: 'New Name Without Status Change',
        status: 'completed'
      });
    });
  });

  describe('DELETE Triggers', () => {
    test('basic DELETE trigger should fire on item deletion', async () => {
      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_delete_trigger')
        .withTiming('AFTER')
        .onEvents('DELETE')
        .executeFunction('delete_notify_func');

      await currentTriggerManager.setupDatabase();

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
        status: 'pending'
      });
    });

    test('conditional DELETE trigger should only fire when condition is met', async () => {
      // First, let's create two test items with different statuses
      const activeItem = await prisma!.item.create({
        data: {
          name: 'Active Item For Deletion',
          status: 'active'
        }
      });

      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_delete_conditional_trigger')
        .withTiming('AFTER')
        .onEvents('DELETE')
        .withCondition(({ OLD }) => OLD.status === 'active')
        .executeFunction('delete_notify_func');

      await currentTriggerManager.setupDatabase();

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
        status: 'active'
      });
    });

    test('DELETE trigger with raw SQL condition should work', async () => {
      // Create another test item with a special name
      const specialItem = await prisma!.item.create({
        data: {
          name: 'Special Item For Deletion',
          status: 'pending'
        }
      });

      // Create a FRESH TriggerManager for this test
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('item')
        .withName('test_delete_sql_trigger')
        .withTiming('AFTER')
        .onEvents('DELETE')
        .withCondition('OLD."name" LIKE \'Special%\'') // Use raw SQL condition with OLD only
        .executeFunction('delete_notify_func');

      await currentTriggerManager.setupDatabase();

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
      const freshTriggerManager = new TriggerManager<
        NonNullable<typeof prisma>
      >(pgClient!);

      currentTriggerManager = freshTriggerManager
        .defineTrigger('list')
        .withName('multi_event_trigger')
        .withTiming('AFTER')
        .onEvents('INSERT', 'UPDATE', 'DELETE')
        .executeFunction('condition_notify_func'); // Reuse condition_test channel

      await currentTriggerManager.setupDatabase();

      // Test INSERT
      const list = await prisma!.list.create({
        data: { name: 'Multi-Event Test List' }
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
