import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import { getDatabaseUrl } from "@/lib/env";

let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  // Identity reconciliation must not depend on email-provider configuration.
  const connectionString = getDatabaseUrl();

  client ??= postgres(connectionString, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    connection: { statement_timeout: 5000 },
  });

  return drizzle(client, { schema });
}
