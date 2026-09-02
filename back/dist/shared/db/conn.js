import { MongoClient } from "mongodb";
const connectionStr = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/';
const cli = new MongoClient(connectionStr);
await cli.connect();
export let db = cli.db('heroclash4geeks');
//# sourceMappingURL=conn.js.map