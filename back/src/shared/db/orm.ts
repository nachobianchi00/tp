import { MikroORM } from "@mikro-orm/mysql";
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqlHighlighter } from "@mikro-orm/sql-highlighter";

export const orm = await MikroORM.init({
    entities:['dist/**/*.entity.js'],
    entitiesTs: ['src/**/*.entity.ts'],
    dbName: 'minigo',
    clientUrl: 'mysql://dsw:dsw@localhost:3306/minigo',
    highlighter: new SqlHighlighter(), 
    debug: true,
    metadataProvider: ReflectMetadataProvider,
    schemaGenerator: { //never in production
        disableForeignKeys: true,
        createForeignKeyConstraints: true,
        ignoreSchema:[],
    },
})

export const syncSchema = async () => {
  const generator = orm.schema;
  /*
  await generator.dropSchema()
  await generator.createSchema()
  */
  await generator.update(); //ver si funciona asi o usar updateSchema
};