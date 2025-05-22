// src/core/event-driven-manager.ts
import { EventEmitter } from 'events';
import postgres from 'postgres';
import { ConnectionManager } from './connection-manager';
import { EnhancedSubscriptionClient } from './subscription-client';
import { MigrationHelper } from './migration-helpers';
import { TypeSafeTriggerBuilder } from './typesafe-builder';
import { ModelName, NotificationPayload } from '../types/core';
import { TriggerConfiguration } from '../types/core-extended';

// Typed events for better DX
export interface TriggerManagerEvents {
  // Lifecycle events
  initialized: void;
  disposed: void;
  error: { error: Error; context?: string };

  // Trigger events
  'trigger:created': { name: string; table: string };
  'trigger:dropped': { name: string; table: string };
  'trigger:error': { name: string; error: Error };

  // Notification events
  'notification:received': { channel: string; payload: any };
  'notification:processed': {
    channel: string;
    duration: number;
    success: boolean;
    error?: Error;
  };
  'notification:batch:completed': {
    channel: string;
    total: number;
    successful: number;
    failed: number;
  };

  // Handler events
  'handler:added': { channel: string; count: number };
  'handler:removed': { channel: string; count: number };
  'handler:error': { channel: string; error: Error; payload: any };

  // Connection events
  'connection:created': 'listener' | 'transaction';
  'connection:error': { type: string; error: Error };

  // Metrics events
  'metrics:snapshot': MetricsSnapshot;
}

export interface MetricsSnapshot {
  timestamp: Date;
  triggers: number;
  channels: number;
  handlers: number;
  notifications: {
    received: number;
    processed: number;
    errors: number;
  };
  memory: {
    heapUsed: number;
    external: number;
  };
}

// Type-safe event emitter
export class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof TriggerManagerEvents>(
    event: K,
    payload: TriggerManagerEvents[K]
  ): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof TriggerManagerEvents>(
    event: K,
    listener: (payload: TriggerManagerEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof TriggerManagerEvents>(
    event: K,
    listener: (payload: TriggerManagerEvents[K]) => void
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof TriggerManagerEvents>(
    event: K,
    listener: (payload: TriggerManagerEvents[K]) => void
  ): this {
    return super.off(event, listener);
  }
}

// Plugin interface for extensibility
export interface TriggerPlugin {
  name: string;
  version: string;

  // Lifecycle hooks
  install?(manager: EventDrivenTriggerManager<any>): Promise<void>;
  uninstall?(manager: EventDrivenTriggerManager<any>): Promise<void>;

  // Trigger hooks
  beforeCreate?(
    config: TriggerConfiguration
  ): TriggerConfiguration | Promise<TriggerConfiguration>;
  afterCreate?(name: string, table: string): void | Promise<void>;

  // Notification hooks
  beforeNotification?(channel: string, payload: any): any | Promise<any>;
  afterNotification?(
    channel: string,
    payload: any,
    duration: number
  ): void | Promise<void>;

  // Error hooks
  onError?(error: Error, context?: string): void | Promise<void>;
}

export class EventDrivenTriggerManager<Client> extends TypedEventEmitter {
  private connectionManager: ConnectionManager;
  private subscriptionClient: EnhancedSubscriptionClient<Client>;
  private migrationHelper: MigrationHelper;
  private plugins = new Map<string, TriggerPlugin>();
  private metrics = {
    notifications: { received: 0, processed: 0, errors: 0 }
  };
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    connectionString: string,
    options: {
      autoCleanup?: boolean;
      metricsInterval?: number;
      plugins?: TriggerPlugin[];
    } = {}
  ) {
    super();

    // Initialize components
    this.connectionManager = new ConnectionManager({
      url: connectionString,
      autoCleanup: options.autoCleanup
    });

    this.subscriptionClient = new EnhancedSubscriptionClient(
      this.connectionManager
    );
    this.migrationHelper = new MigrationHelper(this.connectionManager);

    // Wire up events from components
    this.setupEventForwarding();

    // Install plugins
    if (options.plugins) {
      options.plugins.forEach((plugin) => this.use(plugin));
    }

    // Start metrics collection
    if (options.metricsInterval) {
      this.startMetricsCollection(options.metricsInterval);
    }

    this.emit('initialized', undefined);
  }

  /**
   * Create a new type-safe trigger builder
   */
  create(): TypeSafeTriggerBuilder<Client> {
    return new TypeSafeTriggerBuilder<Client>();
  }

  /**
   * Install a plugin
   */
  async use(plugin: TriggerPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already installed`);
    }

    this.plugins.set(plugin.name, plugin);

    if (plugin.install) {
      try {
        await plugin.install(this);
      } catch (error) {
        this.plugins.delete(plugin.name);
        throw new Error(`Failed to install plugin ${plugin.name}: ${error}`);
      }
    }
  }

  /**
   * Uninstall a plugin
   */
  async unuse(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return;

    if (plugin.uninstall) {
      await plugin.uninstall(this);
    }

    this.plugins.delete(pluginName);
  }

  /**
   * Execute a function within a transaction
   */
  async transaction<T>(
    fn: (tx: postgres.TransactionSql) => Promise<T>
  ): Promise<T> {
    try {
      return await this.connectionManager.transaction(fn);
    } catch (error) {
      this.emit('error', { error: error as Error, context: 'transaction' });
      throw error;
    }
  }

  /**
   * Subscribe to a channel with monitoring
   */
  async subscribe<T>(
    channel: string,
    handler: (payload: NotificationPayload<T>) => void | Promise<void>
  ): Promise<void> {
    await this.subscriptionClient.subscribe<NotificationPayload<T>>(channel, {
      onNotification: async (payload) => {
        // Run plugin hooks
        let processedPayload = payload;
        for (const plugin of this.plugins.values()) {
          if (plugin.beforeNotification) {
            processedPayload = (await plugin.beforeNotification(
              channel,
              processedPayload
            )) as NotificationPayload<T>;
          }
        }

        // Execute handler
        const startTime = Date.now();
        await handler(processedPayload);
        const duration = Date.now() - startTime;

        // Run after hooks
        for (const plugin of this.plugins.values()) {
          if (plugin.afterNotification) {
            await plugin.afterNotification(channel, processedPayload, duration);
          }
        }
      }
    });
  }

  /**
   * Get migration helper for database operations
   */
  migrations(): MigrationHelper {
    return this.migrationHelper;
  }

  /**
   * Get current metrics
   */
  getMetrics(): MetricsSnapshot {
    const subscriptionMetrics = this.subscriptionClient.getMetrics();
    const memoryUsage = process.memoryUsage();

    return {
      timestamp: new Date(),
      triggers: 0, // Would need to track this
      channels: subscriptionMetrics.channels.size,
      handlers: Array.from(subscriptionMetrics.channels.values()).reduce(
        (sum, channel) => sum + channel.handlerCount,
        0
      ),
      notifications: this.metrics.notifications,
      memory: {
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      }
    };
  }

  /**
   * Dispose all resources
   */
  async dispose(): Promise<void> {
    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Uninstall plugins
    for (const [name, plugin] of this.plugins) {
      if (plugin.uninstall) {
        await plugin.uninstall(this);
      }
    }
    this.plugins.clear();

    // Dispose components
    await this.subscriptionClient.dispose();
    await this.connectionManager.dispose();

    this.emit('disposed', undefined);
    this.removeAllListeners();
  }

  private setupEventForwarding(): void {
    // Forward connection manager events
    this.connectionManager.on('connection:created', (type) => {
      this.emit('connection:created', type);
    });

    this.connectionManager.on('error', (error) => {
      this.emit('connection:error', { type: 'connection', error });
    });

    // Forward subscription client events
    this.subscriptionClient.on('notification:received', (data) => {
      this.metrics.notifications.received++;
      this.emit('notification:received', data);
    });

    this.subscriptionClient.on('notification:processed', (data) => {
      if (data.success) {
        this.metrics.notifications.processed++;
      } else {
        this.metrics.notifications.errors++;
      }
      this.emit('notification:processed', data);
    });

    this.subscriptionClient.on('notification:batch:completed', (data) => {
      this.emit('notification:batch:completed', data);
    });

    this.subscriptionClient.on('handler:added', (data) => {
      this.emit('handler:added', data);
    });

    this.subscriptionClient.on('handler:error', (data) => {
      this.emit('handler:error', data);

      // Run plugin error hooks
      for (const plugin of this.plugins.values()) {
        if (plugin.onError) {
          plugin.onError(data.error, 'handler');
        }
      }
    });

    this.subscriptionClient.on('error', (data) => {
      this.emit('error', { error: data.error, context: 'subscription' });
    });
  }

  private startMetricsCollection(interval: number): void {
    this.metricsInterval = setInterval(() => {
      const snapshot = this.getMetrics();
      this.emit('metrics:snapshot', snapshot);
    }, interval);
  }
}

// Example plugins

/**
 * Audit log plugin that logs all trigger operations
 */
export class AuditLogPlugin implements TriggerPlugin {
  name = 'audit-log';
  version = '1.0.0';

  constructor(private logger: Console = console) {}

  async afterCreate(name: string, table: string): Promise<void> {
    this.logger.log(`[AUDIT] Trigger created: ${name} on ${table}`);
  }

  async afterNotification(
    channel: string,
    payload: any,
    duration: number
  ): Promise<void> {
    this.logger.log(
      `[AUDIT] Notification processed: ${channel} (${duration}ms)`
    );
  }

  async onError(error: Error, context?: string): Promise<void> {
    this.logger.error(
      `[AUDIT] Error in ${context || 'unknown'}: ${error.message}`
    );
  }
}

/**
 * Metrics plugin that collects and exposes Prometheus-style metrics
 */
export class MetricsPlugin implements TriggerPlugin {
  name = 'metrics';
  version = '1.0.0';

  private counters = {
    triggersCreated: 0,
    notificationsReceived: 0,
    notificationsProcessed: 0,
    errors: 0
  };

  async install(manager: EventDrivenTriggerManager<any>): Promise<void> {
    manager.on('trigger:created', () => {
      this.counters.triggersCreated++;
    });

    manager.on('notification:received', () => {
      this.counters.notificationsReceived++;
    });

    manager.on('notification:processed', ({ success }) => {
      if (success) {
        this.counters.notificationsProcessed++;
      } else {
        this.counters.errors++;
      }
    });
  }

  getMetrics(): string {
    return `
# HELP pg_triggers_created_total Total number of triggers created
# TYPE pg_triggers_created_total counter
pg_triggers_created_total ${this.counters.triggersCreated}

# HELP pg_notifications_received_total Total number of notifications received
# TYPE pg_notifications_received_total counter
pg_notifications_received_total ${this.counters.notificationsReceived}

# HELP pg_notifications_processed_total Total number of notifications processed
# TYPE pg_notifications_processed_total counter
pg_notifications_processed_total ${this.counters.notificationsProcessed}

# HELP pg_errors_total Total number of errors
# TYPE pg_errors_total counter
pg_errors_total ${this.counters.errors}
    `.trim();
  }
}
