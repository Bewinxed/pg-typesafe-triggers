// src/core/base-trigger.ts (updated with DMMF)
import { ConnectionManager } from './connection-manager';
import { Condition, ConditionBuilder } from './conditions';
import { getTableName, getColumnName } from '../utils/prisma';
import {
  TriggerConfig,
  TriggerHandle,
  TriggerStatus,
  TriggerEvent,
  ModelName,
  Registry,
  TriggerOperation
} from '../types';

export class BaseTrigger<Client, M extends ModelName<Client>>
  implements TriggerHandle<Client, M>
{
  readonly config: TriggerConfig<Client, M>;
  private connectionManager: ConnectionManager;
  private isSetupComplete = false;
  private isListeningActive = false;
  private channel: string;
  private handlers = new Set<(event: any) => void | Promise<void>>();
  private registry?: Registry<Client>;
  private tableName: string;

  constructor(
    config: TriggerConfig<Client, M>,
    connectionManager: ConnectionManager
  ) {
    this.config = this.normalizeConfig(config);
    this.connectionManager = connectionManager;
    this.channel =
      config.notify ||
      `${String(config.model)}_${config.events.join('_').toLowerCase()}`;

    // Get actual table name from DMMF
    this.tableName = getTableName(String(config.model));
  }

  private normalizeConfig(
    config: TriggerConfig<Client, M>
  ): TriggerConfig<Client, M> {
    return {
      ...config,
      name: config.name || this.generateTriggerName(config),
      functionArgs: config.functionArgs || []
    };
  }

  private generateTriggerName(config: TriggerConfig<Client, M>): string {
    const events = config.events.join('_').toLowerCase();
    const timestamp = Date.now().toString(36);
    return `${String(config.model)}_${events}_${timestamp}`;
  }

  async setup(): Promise<void> {
    if (this.isSetupComplete) return;

    // Run plugin hooks
    const finalConfig = await this.connectionManager.runPluginHook(
      'beforeSetup',
      this.config
    );

    // Create notification function if using notify
    if (this.config.notify) {
      await this.createNotifyFunction();
    }

    // Create the trigger
    await this.createTrigger(finalConfig);

    this.isSetupComplete = true;

    // Run after hook
    await this.connectionManager.runPluginHook('afterSetup', this);
  }

  private async createNotifyFunction(): Promise<void> {
    const functionName = this.config.functionName;
    const channel = this.channel;

    const sql = `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS TRIGGER AS $$
      DECLARE
        payload JSONB;
        record_data JSONB;
      BEGIN
        -- Get the appropriate record
        IF TG_OP = 'DELETE' THEN
          record_data = to_jsonb(OLD);
        ELSIF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
          record_data = to_jsonb(NEW);
        ELSE
          record_data = '{}'::JSONB;
        END IF;

        -- Build notification payload
        payload = jsonb_build_object(
          'operation', TG_OP,
          'timestamp', NOW(),
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'data', record_data
        );

        -- Send notification
        PERFORM pg_notify('${channel}', payload::TEXT);
        
        -- Return appropriate record
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        ELSE
          RETURN NEW;
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await this.connectionManager.transaction(async (tx) => {
      await tx.unsafe(sql);
    });
  }

  private buildConditionSQL(config: TriggerConfig<Client, M>): string {
    if (!config.when) return '';

    if (typeof config.when === 'string') {
      return config.when;
    }

    if (typeof config.when === 'function') {
      const builder = new ConditionBuilder<Client, M>();
      const condition = config.when(builder);
      return condition.toSQL();
    }

    // It's already a Condition object
    if (config.when && typeof config.when === 'object' && 'toSQL' in config.when) {
      return (config.when as any).toSQL();
    }

    return '';
  }

  private async createTrigger(config: TriggerConfig<Client, M>): Promise<void> {
    const conditionSQL = this.buildConditionSQL(config);

    // Build trigger SQL using actual table name
    let sql = `CREATE TRIGGER "${config.name}"\n`;
    sql += `${config.timing} ${config.events.join(' OR ')}\n`;

    if (config.watchColumns && config.watchColumns.length > 0) {
      // Map field names to actual column names
      const columns = config.watchColumns.map((col) =>
        getColumnName(String(config.model), String(col))
      );
      sql += `OF ${columns.map((col) => `"${col}"`).join(', ')}\n`;
    }

    // Use actual table name from DMMF
    sql += `ON "${this.tableName}"\n`;
    sql += `FOR EACH ${config.forEach}\n`;

    if (conditionSQL) {
      sql += `WHEN (${conditionSQL})\n`;
    }

    sql += `EXECUTE FUNCTION ${config.functionName}(${
      config.functionArgs?.join(', ') || ''
    });`;

    await this.connectionManager.transaction(async (tx) => {
      await tx.unsafe(sql);
    });
  }

  async drop(): Promise<void> {
    if (!this.isSetupComplete) return;

    await this.stop();

    // Use actual table name
    const sql = `DROP TRIGGER IF EXISTS "${this.config.name}" ON "${this.tableName}";`;
    await this.connectionManager.transaction(async (tx) => {
      await tx.unsafe(sql);
    });

    // Drop function if it was auto-created
    if (this.config.notify) {
      const dropFunc = `DROP FUNCTION IF EXISTS ${this.config.functionName}();`;
      await this.connectionManager.transaction(async (tx) => {
        await tx.unsafe(dropFunc);
      });
    }

    this.isSetupComplete = false;
  }

  async listen(): Promise<void> {
    if (!this.isSetupComplete) {
      throw new Error('Trigger must be setup before listening');
    }

    if (this.isListeningActive) return;

    await this.connectionManager.subscribe(this.channel, async (payload) => {
      try {
        const event = JSON.parse(payload) as TriggerEvent<
          Client,
          M,
          TriggerOperation
        >;

        // Process all handlers concurrently
        await Promise.allSettled(
          Array.from(this.handlers).map((handler) =>
            Promise.resolve(handler(event))
          )
        );
      } catch (error) {
        this.connectionManager.emit('error', error);
      }
    });

    this.isListeningActive = true;
  }

  async stop(): Promise<void> {
    if (!this.isListeningActive) return;

    await this.connectionManager.unsubscribe(this.channel);
    this.isListeningActive = false;
  }

  subscribe<E extends TriggerOperation>(
    handler: (event: TriggerEvent<Client, M, E>) => void | Promise<void>
  ): () => void {
    this.handlers.add(handler as any);

    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler as any);
    };
  }

  getStatus(): TriggerStatus {
    return {
      name: this.config.name!,
      table: this.tableName, // Use actual table name
      active: this.isSetupComplete && this.isListeningActive,
      isSetup: this.isSetupComplete,
      isListening: this.isListeningActive,
      channel: this.channel
    };
  }

  isSetup(): boolean {
    return this.isSetupComplete;
  }

  isListening(): boolean {
    return this.isListeningActive;
  }

  attachToRegistry(registry: Registry<Client>): void {
    this.registry = registry;
  }

  // Add convenience methods
  async setupAndListen(): Promise<void> {
    await this.setup();
    await this.listen();
  }
}
