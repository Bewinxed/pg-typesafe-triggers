// src/core/connection-manager.ts
import postgres from 'postgres';
import { EventEmitter } from 'events';
import { TriggerPlugin, TriggerEvent } from '../types';

export interface ConnectionOptions {
  url: string;
  plugins?: TriggerPlugin[];
  lazy?: boolean;
  connectionPool?: {
    listener?: number;
    transaction?: number;
  };
}

type NotificationHandler = (payload: string) => void | Promise<void>;

interface ChannelSubscription {
  handlers: Set<NotificationHandler>;
  listenRequest?: postgres.ListenRequest;
}

export class ConnectionManager extends EventEmitter {
  private listenerConnection?: postgres.Sql;
  private transactionConnection?: postgres.Sql;
  private channels = new Map<string, ChannelSubscription>();
  private plugins: TriggerPlugin[] = [];
  private disposed = false;
  private cleanupTasks = new Set<() => Promise<void>>();

  constructor(private options: ConnectionOptions) {
    super();

    if (options.plugins) {
      this.plugins = options.plugins;
      this.installPlugins();
    }

    // Register cleanup handlers
    if (process.env.NODE_ENV !== 'test') {
      this.registerCleanupHandlers();
    }
  }

  private async installPlugins(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.install) {
        await plugin.install(this);
      }
    }
  }

  getListenerConnection(): postgres.Sql {
    if (this.disposed) {
      throw new Error('ConnectionManager has been disposed');
    }

    if (!this.listenerConnection) {
      this.listenerConnection = postgres(this.options.url, {
        max: this.options.connectionPool?.listener ?? 1,
        idle_timeout: 0, // Keep alive for LISTEN
        onnotice: (notice) => this.emit('notice', notice)
      });

      this.cleanupTasks.add(async () => {
        if (this.listenerConnection) {
          await this.listenerConnection.end();
        }
      });
    }

    return this.listenerConnection;
  }

  getTransactionConnection(): postgres.Sql {
    if (this.disposed) {
      throw new Error('ConnectionManager has been disposed');
    }

    if (!this.transactionConnection) {
      this.transactionConnection = postgres(this.options.url, {
        max: this.options.connectionPool?.transaction ?? 10,
        idle_timeout: 30
      });

      this.cleanupTasks.add(async () => {
        if (this.transactionConnection) {
          await this.transactionConnection.end();
        }
      });
    }

    return this.transactionConnection;
  }

  async subscribe(
    channel: string,
    handler: NotificationHandler
  ): Promise<void> {
    let subscription = this.channels.get(channel);

    if (!subscription) {
      subscription = { handlers: new Set() };
      this.channels.set(channel, subscription);

      // Start listening
      const sql = this.getListenerConnection();
      subscription.listenRequest = sql.listen(channel, async (payload) => {
        await this.handleNotification(channel, payload);
      });
    }

    subscription.handlers.add(handler);
  }

  async unsubscribe(
    channel: string,
    handler?: NotificationHandler
  ): Promise<void> {
    const subscription = this.channels.get(channel);
    if (!subscription) return;

    if (handler) {
      subscription.handlers.delete(handler);
    } else {
      subscription.handlers.clear();
    }

    if (subscription.handlers.size === 0) {
      if (subscription.listenRequest) {
        try {
          const meta = await subscription.listenRequest;
          await meta.unlisten();
        } catch (error) {
          this.emit('error', error);
        }
      }
      this.channels.delete(channel);
    }
  }

  private async handleNotification(
    channel: string,
    payload: string
  ): Promise<void> {
    const subscription = this.channels.get(channel);
    if (!subscription) return;

    const startTime = Date.now();
    let parsedPayload: any;

    try {
      parsedPayload = JSON.parse(payload);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse notification: ${error}`));
      return;
    }

    // Run plugin hooks
    for (const plugin of this.plugins) {
      if (plugin.beforeNotification) {
        parsedPayload = await plugin.beforeNotification(parsedPayload);
      }
    }

    // Process handlers concurrently
    const results = await Promise.allSettled(
      Array.from(subscription.handlers).map((handler) =>
        Promise.resolve(handler(JSON.stringify(parsedPayload)))
      )
    );

    const duration = Date.now() - startTime;

    // Run after hooks
    for (const plugin of this.plugins) {
      if (plugin.afterNotification) {
        await plugin.afterNotification(parsedPayload, duration);
      }
    }

    // Report errors
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      this.emit('handler:errors', {
        channel,
        errors: failures.map((f) => (f as PromiseRejectedResult).reason)
      });
    }
  }

  async runPluginHook<T>(hookName: keyof TriggerPlugin, data: T): Promise<T> {
    let result = data;

    for (const plugin of this.plugins) {
      const hook = plugin[hookName] as any;
      if (typeof hook === 'function') {
        result = (await hook.call(plugin, result)) || result;
      }
    }

    return result;
  }

  async transaction<T>(
    fn: (tx: postgres.TransactionSql) => Promise<T>
  ): Promise<T> {
    const sql = this.getTransactionConnection();
    return sql.begin(fn) as Promise<T>;
  }

  async query(strings: TemplateStringsArray, ...values: any[]): Promise<any> {
    const sql = this.getTransactionConnection();
    return await sql(strings, ...values);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    this.emit('disposing');

    // Uninstall plugins
    for (const plugin of this.plugins) {
      if (plugin.uninstall) {
        await plugin.uninstall(this);
      }
    }

    // Close all channels
    for (const channel of this.channels.keys()) {
      await this.unsubscribe(channel);
    }

    // Run cleanup tasks
    await Promise.allSettled(
      Array.from(this.cleanupTasks).map((task) => task())
    );

    this.cleanupTasks.clear();
    this.channels.clear();
    this.removeAllListeners();
  }

  private registerCleanupHandlers(): void {
    const cleanup = async () => {
      await this.dispose();
    };

    process.once('SIGTERM', cleanup);
    process.once('SIGINT', cleanup);
    process.once('beforeExit', cleanup);

    this.cleanupTasks.add(async () => {
      process.removeListener('SIGTERM', cleanup);
      process.removeListener('SIGINT', cleanup);
      process.removeListener('beforeExit', cleanup);
    });
  }

  isDisposed(): boolean {
    return this.disposed;
  }
}
