# Cosmos ORM

> A simple ORM for Cosmos DB, to make your life a little bit easier (at least, it does mine).

This is a simple Typescript ORM for [Azure Cosmos DB](https://azure.microsoft.com/products/cosmos-db), Microsoft's NoSQL database. It provides some helper functions to create a client for a Cosmos database, and creating ORM models for each container within that database. The methods within the base ORM model loosely follow the [Lucid ORM](https://lucid.adonisjs.com), some of which are `.all()`, `.find(id)`, `.findMany([id])`.

### Setup

Install this package:

```sh
pnpm install cosmos-orm
yarn install cosmos-orm
npm install cosmos-orm
```

Make sure you have your Cosmos DB connection string added to your `.env` or `local.settings.json` file - by default, the client looks for an env with the name `COSMOS_CONNECTION_STRING`.

Then, instantiate the client for a database:

```ts
import { createClient } from 'cosmos-orm'

// A sample type - you may define this here, or import it from another file or from an OpenAPI definition from `openapi-typescript` perhaps
interface Post {
  title: string
  author: string
  slug: string
}

const orm = createClient({
  // Optional, defaults to `COSMOS_CONNECTION_STRING` - this is the name of the env that holds your Cosmos DB connection string.
  connectionStringSetting: 'COSMOS_CONNECTION_STRING',
  // Required, the name of the Cosmos database you want to create a client for
  database: 'my-db',
  // Optional, but kind of the whole point: create a map of containers -> models
  // (t) is a helper function to create a model for a container
  models: t => ({
    // The createModel function accepts a generic, so you can get typed methods + returned data
    user: t.createModel<{ name: string, email: string }>('users'),
    post: t.createModel<Post>('posts', {
      // By default, the ORM automatically generates an ID for the document on creation,
      // and also adds createdAt and updatedAt timestamps - you can disable these if needed.
      fields: { id: true, timestamp: false }
    })
  })
})

// Now you can use the models:

const user = await orm.user.find('abc123') // { id: string, name: string, email: string }

const posts = await orm.post.all() // { id: string, title: string, author: string, slug: string }[]

// Write SQL queries as a string
const sortedPosts = await orm.post.query(`SELECT * FROM P ORDER BY P.title ASC`) // Always returns the full Post type, this isn't a typed query builder

// Write SQL queries with parameters
const usersPosts = await orm.post.query({
  query: `SELECT * FROM P WHERE P.author = @authorId`,
  parameters: [{name: '@authorId', value: user.id }]
})
```

### Azure Functions

If you are using this within an Azure Function App, there are some handy helper functions you can use to create input bindings for your handlers:

```ts
// Import your ORM from wherever you created it
import orm from '../utils/orm'

// This will create an input binding that fetches a user that has an ID matching the input context variable `Query.id` - see below this code example for explanation.
const userInputBinding = orm.user.createFindBinding('Query.id')

// This will create an input binding that fetches all items from a container
const postsInputBinding = orm.post.createAllBinding()

// Create your handler, and use context.extraInputs to fetch input documents
export async function handler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const user = context.extraInputs.get(userInputBinding)
  const posts = context.extraInputs.get(postsInputBinding)

  return {
    status: 200,
    body: { user, posts }
  }
}

app.http('User', {
  handler: handler,
  route: 'user',
  methods: ['GET'],
  authLevel: 'anonymous',
  // Make sure to add the input bindings here
  extraInputs: [userInputBinding, postsInputBinding],
})
```

Checkout the documentation to learn more about input bindings and see some examples [here](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-cosmosdb-v2-input?pivots=programming-language-typescript&tabs=python-v2%2Cisolated-process%2Cnodejs-v4%2Cextensionv4), and [here](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-expressions-patterns).
