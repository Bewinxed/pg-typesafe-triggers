// src/core/connection-manager.ts
import postgres from 'postgres';
import { EventEmitter } from 'events';

export interface ConnectionOptions {
  url: string;
  max?: number;
  idleTimeout?: number;
  autoCleanup?: boolean;
}

export class ConnectionManager extends EventEmitter {
  private listenerConnection?: postgres.Sql;
  private transactionConnection?: postgres.Sql;
  private cleanupTasks = new Set<() => Promise<void>>();
  private disposed = false;

  constructor(private options: ConnectionOptions) {
    super();

    if (options.autoCleanup) {
      this.registerCleanupHandlers();
    }
  }

  /**
   * Get a dedicated connection for LISTEN/NOTIFY operations
   * This connection stays open and is reused for all listeners
   */
  getListenerConnection(): postgres.Sql {
    if (this.disposed) {
      throw new Error('ConnectionManager has been disposed');
    }

    if (!this.listenerConnection) {
      this.listenerConnection = postgres(this.options.url, {
        max: 1, // Single connection for all LISTEN operations
        idle_timeout: 0, // Keep connection alive
        onnotice: (notice) => {
          this.emit('notice', notice);
        }
      });

      this.cleanupTasks.add(async () => {
        if (this.listenerConnection) {
          await this.listenerConnection.end();
          this.listenerConnection = undefined;
        }
      });

      this.emit('connection:created', 'listener');
    }

    return this.listenerConnection;
  }

  /**
   * Get a connection for regular queries and transactions
   */
  getTransactionConnection(): postgres.Sql {
    if (this.disposed) {
      throw new Error('ConnectionManager has been disposed');
    }

    if (!this.transactionConnection) {
      this.transactionConnection = postgres(this.options.url, {
        max: this.options.max || 10,
        idle_timeout: this.options.idleTimeout || 30
      });

      this.cleanupTasks.add(async () => {
        if (this.transactionConnection) {
          await this.transactionConnection.end();
          this.transactionConnection = undefined;
        }
      });

      this.emit('connection:created', 'transaction');
    }

    return this.transactionConnection;
  }

  /**
   * Execute within a transaction
   */
  async transaction<T>(
    fn: (tx: postgres.TransactionSql) => Promise<T>
  ): Promise<T> {
    const conn = this.getTransactionConnection();
    return conn.begin(fn) as Promise<T>;
  }

  /**
   * Dispose all connections and cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    this.emit('disposing');

    // Run all cleanup tasks
    const tasks = Array.from(this.cleanupTasks);
    await Promise.allSettled(tasks.map((task) => task()));

    this.cleanupTasks.clear();
    this.removeAllListeners();
    this.emit('disposed');
  }

  /**
   * Check if the manager has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
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
}
