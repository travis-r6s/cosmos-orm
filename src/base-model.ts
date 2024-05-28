import type { Container, FeedOptions, ItemDefinition, Resource } from '@azure/cosmos'
import type { CosmosClient, SqlQuerySpec } from '@azure/cosmos'
import { input } from '@azure/functions'
import { ulid } from 'ulidx'

export type Base = object

// TODO: Make sure these always returns the correct type
type CosmosResource<T extends Base> = Resource & T
type CosmosItemDefinition<T extends Base> = ItemDefinition & T

interface AutoFields {
  /** Automatically generate an ID on document creation - defaults to true */
  id?: boolean
  /** Automatically generate createdAt and updatedAt fields on document create/updates - defaults to true */
  timestamp?: boolean
}

export interface ModelOptions {
  /** The name of the Cosmos database */
  database: string
  /** The name of the Cosmos container within the database */
  container: string
  /** The instantiated Cosmos client */
  client: CosmosClient
  /** The name of the env of the Cosmos connection string - defaults to `COSMOS_CONNECTION_STRING` */
  connectionStringSetting?: string
  /** Automatic fields creation - defaults to true */
  fields?: AutoFields | boolean
}

const initial = {}

export class BaseModel<T extends Base = typeof initial> {
  client: Container

  connectionStringSetting = 'COSMOS_CONNECTION_STRING'

  fields: AutoFields = {
    id: true,
    timestamp: true,
  }

  constructor(private options: ModelOptions) {
    if (options.connectionStringSetting) {
      this.connectionStringSetting = options.connectionStringSetting
    }

    if (typeof this.options === 'boolean' && !this.options) {
      this.fields = { id: false, timestamp: false }
    }
    if (typeof this.options === 'object') {
      this.fields = {
        ...this.fields,
        // Don't know why this won't remove the bool type
        ...(this.options.fields as AutoFields),
      }
    }

    const connectionString = process.env[this.connectionStringSetting]
    if (typeof connectionString !== 'string') {
      throw new Error(`Missing an env with the name ${this.connectionStringSetting}`)
    }

    this.client = options.client.database(options.database).container(options.container)
  }

  /**
   * Create an Azure Function app input binding to find a specific document by an input variable.
   * TODO: Add example usage
   */
  public createFindBinding(variable = 'id') {
    return input.cosmosDB({
      databaseName: this.options.database,
      containerName: this.options.container,
      connection: this.connectionStringSetting,
      id: `{${variable}}`,
      partitionKey: `{${variable}}`,
    })
  }

  /** Create an Azure Function app input binding to fetch all documents from this container. */
  public createAllBinding() {
    return input.cosmosDB({
      databaseName: this.options.database,
      containerName: this.options.container,
      connection: this.connectionStringSetting,
    })
  }

  /** Create an Azure Function app input binding with a custom SQL query. */
  public createSQLBinding(sqlQuery: string) {
    return input.cosmosDB({
      databaseName: this.options.database,
      containerName: this.options.container,
      connection: this.connectionStringSetting,
      sqlQuery,
    })
  }

  /** Fetch all resources in a container */
  public async all(): Promise<CosmosItemDefinition<T>[]> {
    const { resources } = await this.client.items.readAll().fetchAll()
    return resources as CosmosItemDefinition<T>[]
  }

  /** Fetch a specific resource by its ID */
  public async find(id: string): Promise<CosmosResource<T> | undefined> {
    const { resource } = await this.client.item(id, id).read()
    return resource as CosmosResource<T> | undefined
  }

  /** Fetch multiple resources using their ID's */
  public async findMany(ids: string[]): Promise<CosmosResource<T>[]> {
    const { resources } = await this.client.items
      .query({
        query: 'SELECT * FROM C WHERE ARRAY_CONTAINS(@ids, C.id)',
        parameters: [{ name: '@ids', value: ids }],
      })
      .fetchAll()

    return resources as CosmosResource<T>[]
  }

  /** Find a resource by a specific key */
  public async findBy(key: keyof T, value: string): Promise<CosmosResource<T> | undefined> {
    const { resources } = await this.client.items
      .query({
        query: 'SELECT * FROM C WHERE C[@key] = @value OFFSET 0 LIMIT 1',
        parameters: [
          { name: '@key', value: String(key) },
          { name: '@value', value: value },
        ],
      })
      .fetchAll()

    const [resource] = resources

    return resource as CosmosResource<T> | undefined
  }

  /** Find multiple resources by a specific key */
  public async findManyBy(key: keyof T, value: string): Promise<CosmosResource<T>[]> {
    const { resources } = await this.client.items
      .query({
        query: 'SELECT * FROM C WHERE C[@key] = @value',
        parameters: [
          { name: '@key', value: String(key) },
          { name: '@value', value: value },
        ],
      })
      .fetchAll()

    const [resource] = resources

    return resource as CosmosResource<T>[]
  }

  /** Create a resource */
  public async create(
    input: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & Partial<{ id: string; createdAt: string; updatedAt: string }>,
  ): Promise<CosmosResource<T> | undefined> {
    const merged = {
      ...input,
      id: this.fields.id ? ulid() : input.id,
      createdAt: this.fields.timestamp ? new Date().toISOString() : input.createdAt,
      updatedAt: this.fields.timestamp ? new Date().toISOString() : input.updatedAt,
    }

    const { resource } = await this.client.items.create(merged)
    return resource as CosmosResource<T> | undefined
  }

  /** Either update or create a resource */
  public async upsert(input: T & { id: string }): Promise<CosmosResource<T> | undefined> {
    const { resource } = await this.client.items.upsert(input)
    return resource as CosmosResource<T> | undefined
  }

  /** Update a resource - replaces the whole resource, so make sure to provide a full input */
  public async replace(
    id: string,
    input: Omit<T, 'updatedAt'> & Partial<{ updatedAt: string }>,
  ): Promise<CosmosResource<T> | undefined> {
    const merged = {
      ...input,
      updatedAt: this.fields.timestamp ? new Date().toISOString() : input.updatedAt,
    }

    const { resource } = await this.client.item(id, id).replace(merged)
    return resource as CosmosResource<T> | undefined
  }

  /** Delete a resource */
  public async delete(id: string): Promise<CosmosResource<T> | undefined> {
    const { resource } = await this.client.item(id, id).delete<T>()
    return resource as CosmosResource<T>
  }

  /**
   * Run a query, and fetch all results
   *
   * This function accepts a generic, so you can pass in the type of the response if
   * you are running a custom select query - for example:
   *
   * `.query<{ id: string }>('SELECT c.id FROM c') // returns { id: string }[]`
   *
   * `.query<number>('SELECT VALUE count(c.id) FROM c') // returns [number]`
   *
   * This is just a wrapper of the `.client.items.query()` function, so you can use that
   * instead if you need access to the request metrics for example.
   */

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  public async query<R = any>(query: string | SqlQuerySpec, options?: Pick<FeedOptions, 'maxItemCount'>): Promise<R[]> {
    const { resources } = await this.client.items.query(query, options).fetchAll()
    return resources as R[]
  }
}
