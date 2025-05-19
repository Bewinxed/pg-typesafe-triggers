// src/define/executor.ts
import postgres from 'postgres';
import { ModelName, DefineTriggerOptions } from '../types/core';
import { TriggerSQLGenerator } from './generator';

/**
 * Executes SQL statements for managing database triggers
 */
export class TriggerExecutor<Client> {
  private sql: postgres.Sql;
  private generator: TriggerSQLGenerator<Client>;

  /**
   * Creates a new TriggerExecutor instance
   *
   * @param sql - A postgres.js client instance
   */
  constructor(sql: postgres.Sql) {
    this.sql = sql;
    this.generator = new TriggerSQLGenerator<Client>();
  }

  /**
   * Creates a trigger in the database based on the provided options
   *
   * @param options - Options for defining the trigger
   * @returns A promise that resolves when the trigger is created
   */
  public async createTrigger<M extends ModelName<Client>>(
    options: DefineTriggerOptions<Client, M>
  ): Promise<void> {
    const sql = this.generator.generateCreateTriggerSQL(options);
    await this.sql.unsafe(sql);
  }

  /**
   * Drops a trigger from the database
   *
   * @param modelName - The Prisma model (table) name
   * @param triggerName - The name of the trigger to drop
   * @returns A promise that resolves when the trigger is dropped
   */
  public async dropTrigger<M extends ModelName<Client>>(
    modelName: M,
    triggerName: string
  ): Promise<void> {
    const sql = this.generator.generateDropTriggerSQL(modelName, triggerName);
    await this.sql.unsafe(sql);
  }

  /**
   * Creates a notification function in the database
   *
   * @param functionName - The name of the function to create
   * @param channelName - The notification channel name
   * @returns A promise that resolves when the function is created
   */
  public async createNotifyFunction(
    functionName: string,
    channelName: string
  ): Promise<void> {
    const sql = this.generator.generateNotifyFunctionSQL(
      functionName,
      channelName
    );
    await this.sql.unsafe(sql);
  }
}
