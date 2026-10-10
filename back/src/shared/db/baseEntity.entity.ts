import { Property, PrimaryKey} from '@mikro-orm/decorators/legacy';

export abstract class BaseEntity {
  @PrimaryKey()
  id?: number

  
/*
  @Property()
  createdAt? = new Date()

  @Property({
    type: DateTimeType,
    onUpdate: () => new Date(),
  })
  updatedAt? = new Date()

  */
}