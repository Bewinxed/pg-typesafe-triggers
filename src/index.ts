// src/index.ts
import postgres from 'postgres';
import { NotificationRegistry, ChannelConfig, NotificationClientBuilder, EnhancedTriggerDefinition } from './notification/registry'; // Added EnhancedTriggerDefinition
import { SubscriptionClient } from './subscribe/client';
import { ModelName } from './types/core';
import { TriggerDefinition } from '../trigger/definition'; // Added TriggerDefinition

/**
 * Represents the necessary methods from an external trigger-like object
 * that createTriggers needs for database interactions.
 */
interface PgTriggerLike {
  createNotifyFunction: (functionName: string, channelName: string) => Promise<void>;
  getSubscriptionClient: <T>() => SubscriptionClient<T>;
  sql: postgres.Sql; // Added sql property
  // Potentially other methods needed for trigger definition later on
}

/**
 * Configuration for a single notification channel.
 */
interface ChannelDefinitionConfig<Client, M extends ModelName<Client>> {
  /** The model associated with this channel, for model-specific notifications. */
  model?: M;
  /** Optional custom name for the database notification function. */
  functionName?: string;
}

/**
 * Configuration for the createTriggers function.
 */
interface CreateTriggersConfig<Client> {
  /** The external object providing database interaction capabilities. */
  pgTrigger: PgTriggerLike;
  /**
   * A map of channel names to their configurations.
   * The key is the channel name, and the value is its configuration.
   */
  channels: {
    [channelName: string]: ChannelDefinitionConfig<Client, ModelName<Client>>;
  };
}

/**
 * The result of the createTriggers function.
 */
interface CreateTriggersResult<
  Client,
  // Using a more specific type for AddedChannels based on the structure of registry.config.channels
  AddedChannels extends Record<string, ChannelConfig<Client, ModelName<Client>, any>>
> {
  /** The configured notification registry. */
  registry: NotificationRegistry<Client, AddedChannels>;
  /** The client builder for creating notification clients. */
  client: NotificationClientBuilder<Client, AddedChannels>;
  /** Function to define a new trigger associated with the registry. */
  defineTrigger: <M extends ModelName<Client>>(
    modelName: M
  ) => EnhancedTriggerDefinition<Client, M, ReturnType<NotificationRegistry<Client, AddedChannels>['getRegistry']>>;
}

/**
 * Creates and configures notification triggers, sets up database functions,
 * and returns a registry and a client builder.
 *
 * @template Client - The type of the database client (e.g., PrismaClient).
 * @template AddedChannels - A record type representing the channels that will be added to the registry.
 *                           This is typically inferred by TypeScript.
 * @param {CreateTriggersConfig<Client>} config - Configuration for the triggers.
 * @returns {Promise<CreateTriggersResult<Client, any>>} An object containing the notification registry and a client builder.
 *          The `any` for AddedChannels in the return promise will be refined if possible,
 *          otherwise it acknowledges the dynamic nature of the registry's channels.
 *          The actual return type aims for CreateTriggersResult<Client, InferredAddedChannels>.
 */
export async function createTriggers<
  Client,
  // This generic will capture the structure of the channels passed in, allowing for a more typed registry and client.
  // We default it to an empty object, and it will be inferred from the usage.
  // The `registry.modelChannel` and `registry.customChannel` will build up this type.
  // For the return type, we cast to `any` for now for `AddedChannels` in `CreateTriggersResult`
  // as precisely typing the dynamic registry construction through `config.channels` is complex
  // for the function's signature directly. The instantiated `registry` and `client` will be correctly typed.
  _ChannelsConfig extends CreateTriggersConfig<Client>['channels'] // Helper generic
>(
  config: CreateTriggersConfig<Client> & { channels: _ChannelsConfig } // Intersect to help inference
): Promise<CreateTriggersResult<Client, any /* Placeholder for actual AddedChannels type from registry instance */ >> {
  // 1. Initialize an empty NotificationRegistry.
  // The AddedChannels type for the registry will be built dynamically.
  const registry = new NotificationRegistry<Client, any>();

  // 2. Iterate over `config.channels`:
  for (const channelName in config.channels) {
    if (Object.prototype.hasOwnProperty.call(config.channels, channelName)) {
      const channelConfig = config.channels[channelName];
      if (channelConfig.model) {
        // For model channels
        registry.modelChannel(
          channelName,
          channelConfig.model as ModelName<Client>, // Type assertion as M is not directly carried here
          { functionName: channelConfig.functionName }
        );
      } else {
        // For custom channels
        registry.customChannel(channelName, { functionName: channelConfig.functionName });
      }
    }
  }

  // 3. Call `registry.createAllFunctions(config.pgTrigger)`.
  await registry.createAllFunctions(config.pgTrigger);

  // 4. Create a client builder using `registry.createClientBuilder(config.pgTrigger)`.
  const client = registry.createClientBuilder(config.pgTrigger);

  // 5. Return the registry and the client builder.
  // The `registry` and `client` instances will have a more specific `AddedChannels` type
  // based on the channels actually added.

  // Type assertion for registry needed because its generic type `any` needs to be compatible
  // with what EnhancedTriggerDefinition expects. The actual instance will be correctly typed.
  const typedRegistry = registry as NotificationRegistry<Client, AddedChannels>;

  return {
    registry: typedRegistry,
    client,
    defineTrigger: <M extends ModelName<Client>>(modelName: M) => {
      const baseTrigger = new TriggerDefinition<Client, M>(config.pgTrigger.sql, modelName);
      return new EnhancedTriggerDefinition<Client, M, ReturnType<typeof typedRegistry.getRegistry>>(
        baseTrigger,
        typedRegistry
      );
    },
  };
}
