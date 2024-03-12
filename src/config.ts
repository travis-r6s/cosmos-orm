import { CosmosClient } from '@azure/cosmos'
import { type Base, BaseModel } from './base-model'

interface Builder {
  createModel: <T extends Base>(container: string) => BaseModel<T>
}

/** Default client configuration - for example the connection string setting, and the database name. */
export interface Options<M extends { [K: string]: BaseModel }> {
  /** The name of the Cosmos database */
  database: string
  /** The name of the env of the Cosmos connection string - defaults to `COSMOS_CONNECTION_STRING` */
  connectionStringSetting?: string
  /** A list of the models to create, and their container names. */
  models: (builder: Builder) => M
}

export type DB<M extends Record<string, BaseModel>, O extends Options<M>> = ReturnType<O['models']> & {
  client: CosmosClient
}

export function createClient<M extends Record<string, BaseModel>>(options: Options<M>): DB<M, Options<M>> {
  const connectionStringSetting = options.connectionStringSetting || 'COSMOS_CONNECTION_STRING'
  const connectionString = process.env[connectionStringSetting]
  if (typeof connectionString !== 'string') throw new Error(`Missing env for ${connectionStringSetting}`)

  const client = new CosmosClient(connectionString)

  const builder: Builder = {
    createModel: (container) => new BaseModel({ client, container, ...options }),
  }

  // This will return an object like { [key: string]: BaseModel<T> }
  const models = options.models(builder)

  return {
    client,
    ...models,
  }
}
