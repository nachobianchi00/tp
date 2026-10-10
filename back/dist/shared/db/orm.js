import { MikroORM } from "@mikro-orm/mysql";
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { SqlHighlighter } from "@mikro-orm/sql-highlighter";
const clientUrl = process.env.DATABASE_URL;
if (!clientUrl) {
    throw new Error('DATABASE_URL must be set to connect to MySQL');
}
export const orm = await MikroORM.init({
    entities: ['dist/**/*.entity.js'],
    entitiesTs: ['src/**/*.entity.ts'],
    clientUrl,
    highlighter: new SqlHighlighter(),
    debug: true,
    metadataProvider: ReflectMetadataProvider,
    schemaGenerator: {
        disableForeignKeys: true,
        createForeignKeyConstraints: true,
        ignoreSchema: [],
    },
});
export const syncSchema = async () => {
    await orm.schema.update();
};
