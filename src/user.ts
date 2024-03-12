import { BaseModel } from './base-model'

// So how do we instantiate this, and pass it to the base model?

class User {
  // TODO: This should be this class, with only static props?
  constructor(input: Record<string, unknown>) {
    Object.assign(this, input)
  }

  declare id: string

  declare firstName: string
  declare lastName: string

  public get name(): string {
    return `${this.firstName} ${this.lastName}`
  }
}

const user = new User({
  id: '1',
  firstName: 'Travis',
  lastName: 'Reynolds',
})

console.log(user.name)
