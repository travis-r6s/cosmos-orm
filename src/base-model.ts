import type { Container, ItemDefinition, Resource } from '@azure/cosmos'
import { CosmosClient, type SqlQuerySpec } from '@azure/cosmos'
import { input } from '@azure/functions'
import { ulid } from 'ulidx'

// TODO: Make sure this always returns the correct type
interface Base extends Record<string, unknown> {}
type CosmosResource<T extends Base> = Resource & T
type CosmosItemDefinition<T extends Base> = ItemDefinition & T

interface Options {
  /** The name of the Cosmos database */
  database: string
  /** The name of the Cosmos container within the database */
  container: string
  /** The name of the env of the Cosmos connection string - defaults to `COSMOS_CONNECTION_STRING` */
  connectionStringSetting?: string
}

// TODO: We could add methods to this base, like Lucid does?
const initial = {}

export class BaseModel<T extends Base = typeof initial> {
  client: Container

  connectionStringSetting = 'COSMOS_CONNECTION_STRING'

  constructor(private options: Options) {
    // TODO: This might as well be in a parent, so we have a main client we pass down?
    // Although each instance of this will be different, so perhaps merge parent defaults?
    if (options.connectionStringSetting) {
      this.connectionStringSetting = options.connectionStringSetting
    }

    const connectionString = process.env[this.connectionStringSetting]
    if (typeof connectionString !== 'string') {
      throw new Error(`Missing an env with the name ${this.connectionStringSetting}`)
    }

    const cosmos = new CosmosClient(connectionString)
    this.client = cosmos.database(options.database).container(options.database)
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

  /** Fetch all resources in a container */
  public async all(): Promise<CosmosItemDefinition<T>[]> {
    const { resources } = await this.client.items.readAll().fetchAll()
    return resources as CosmosItemDefinition<T>[]
  }

  // TODO: So I basically want to return another model instantiated with
  // the fetched data then I can call a computed which has access to the user result?

  /** Find a specific resource by its ID */
  public async find(id: string): Promise<CosmosResource<T> | undefined> {
    const { resource } = await this.client.item(id, id).read()
    return resource as CosmosResource<T> | undefined
  }

  /** Create a resource */
  public async create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<CosmosResource<T> | undefined> {
    // TODO: Choose whether we should add these fields?
    const merged = {
      ...input,
      id: ulid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
  public async replace(id: string, input: Omit<T, 'id' | 'updatedAt'>): Promise<CosmosResource<T> | undefined> {
    const merged = {
      ...input,
      updatedAt: new Date().toISOString(),
    }

    const { resource } = await this.client.item(id, id).replace(merged)
    return resource as CosmosResource<T> | undefined
  }

  /** Delete a resource */
  public async delete(id: string): Promise<CosmosResource<T> | undefined> {
    const { resource } = await this.client.item(id, id).delete<T>()
    return resource
  }

  /** Run a query, and fetch all results */
  public async query(query: string | SqlQuerySpec): Promise<CosmosResource<T>[]> {
    const { resources } = await this.client.items.query(query).fetchAll()
    return resources
  }
}
