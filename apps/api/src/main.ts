import { resolve } from 'node:path';
import { openDatabase, migrate } from './database.ts';
import { createApp } from './app.ts';
async function main() {
  const db = await openDatabase(
    process.env.DATABASE_URL ?? `sqlite:${resolve('.var/central.sqlite')}`,
  );
  await migrate(db);
  const { app } = await createApp(db);
  await app.listen({
    host: process.env.API_HOST ?? '127.0.0.1',
    port: Number(process.env.API_PORT ?? 4310),
  });
  console.log(
    `Pillxai API http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? 4310} (${db.dialect})`,
  );
  process.once('SIGINT', async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
