import { MikroORM } from "@mikro-orm/core";
import { MySqlDriver } from '@mikro-orm/mysql';
import { SqlHighlighter } from "@mikro-orm/sql-highlighter";

export const orm = await MikroORM.init<MySqlDriver>({
    entities:['dist/**/*.entity.js'],
    entitiesTs: ['src/**/*.entity.ts'],
    dbName: 'minigo',
    driver: MySqlDriver,
    clientUrl: 'mysql://dsw:dsw@localhost:3306/minigo',
    highlighter: new SqlHighlighter(), 
    debug: true,
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
  await generator.update();
};