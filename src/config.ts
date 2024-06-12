import { CosmosClient } from '@azure/cosmos'
import { type Base, BaseModel } from './base-model'
import type { ModelOptions } from './base-model'

interface Builder {
  createModel: <T extends Base>(container: string, options?: Pick<ModelOptions, 'fields'>) => BaseModel<T>
}

/** Default client configuration - for example the connection string setting, and the database name. */
export interface Options<M extends { [K: string]: BaseModel }> {
  /** The name of the Cosmos database */
  database: string
  /**
   * The name of the env of the Cosmos connection string - defaults to `COSMOS_CONNECTION_STRING`.
   * This can be replaced by directly passing in the connection string with the `connectionString` option,
   * but if you are using the binding shortcuts then this setting is required as it is used in the Azure Function bindings.
   */
  connectionStringSetting?: string
  /**
   * The Cosmos connection string - overrides using the `connectionStringSetting` env.
   *
   * Preferably use the `connectionStringSetting` with the connection string as an environment variable if you are using
   * this within an Azure Functions app.
   */
  connectionString?: string
  /** A list of the models to create, and their container names. */
  models: (builder: Builder) => M
}

export type DB<M extends Record<string, BaseModel>> = ReturnType<Options<M>['models']> & {
  client: CosmosClient
}

export function createClient<M extends Record<string, BaseModel>>(options: Options<M>): DB<M> {
  const connectionStringSetting = options.connectionStringSetting || 'COSMOS_CONNECTION_STRING'
  const connectionString = options.connectionString ?? process.env[connectionStringSetting]

  if (typeof connectionString !== 'string') {
    if (options.connectionString) throw new Error('Missing connection string value (from `options.connectionString`)')
    throw new Error(`Missing connection string for ${connectionStringSetting}`)
  }

  const client = new CosmosClient(connectionString)

  const builder: Builder = {
    createModel: (container, config = {}) => new BaseModel({ client, container, ...options, ...config }),
  }

  const models = options.models(builder)

  return {
    client,
    ...models,
  }
}
