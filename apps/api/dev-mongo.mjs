/** Local dev Mongo (mongodb-memory-server) — prints the URI and stays alive. */
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create({ instance: { port: 33333, dbName: 'ats' } });
console.log('DEV_MONGO_URI=' + mongod.getUri('ats'));
const shutdown = async () => { try { await mongod.stop(); } catch { /* ignore */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => { /* keep the event loop alive */ }, 1 << 30);
