import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type postgres from "postgres";

export async function replayMigrations(
  tx: postgres.TransactionSql,
  namespace: string,
  folder: string,
  last = Number.POSITIVE_INFINITY,
  extra: MigrationMeta[] = [],
  journalNamespace = namespace
) {
  if (
    !/^[a-z_][a-z0-9_]*$/.test(namespace) ||
    !/^[a-z_][a-z0-9_]*$/.test(journalNamespace)
  )
    throw Error("Unsafe test schema");
  await tx.unsafe(`SET LOCAL search_path TO "${namespace}", public`);
  const dialect = new PgDialect();
  const execute = (query: SQL) => {
    const compiled = dialect.sqlToQuery(query);
    return tx.unsafe(
      compiled.sql,
      compiled.params as Parameters<typeof tx.unsafe>[1]
    );
  };
  const session = {
    execute,
    all: execute,
    transaction: async (
      work: (executor: { execute: typeof execute }) => Promise<void>
    ) => work({ execute }),
  };
  const migrations = [
    ...readMigrationFiles({ migrationsFolder: folder }).slice(0, last + 1),
    ...extra,
  ].map((migration) => ({
    ...migration,
    sql: migration.sql.map((statement) =>
      statement.replaceAll('"public".', `"${namespace}".`)
    ),
  }));
  await dialect.migrate(
    migrations,
    session as unknown as Parameters<PgDialect["migrate"]>[1],
    { migrationsFolder: folder, migrationsSchema: journalNamespace }
  );
  return migrations;
}

/** Compare effective schema, not source order or PostgreSQL object IDs. No data is read. */
export async function schemaCatalog(
  tx: postgres.TransactionSql,
  namespace: string
) {
  if (!/^[a-z_][a-z0-9_]*$/.test(namespace))
    throw Error("Unsafe catalog schema");
  await tx.unsafe(`SET LOCAL search_path TO "${namespace}", public`);
  const tables =
    await tx`select c.relname, c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity, c.relreplident, c.reloptions, c.relacl::text as acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=${namespace} and c.relkind in ('r','p','v','m','S') and c.relname not like '__drizzle_migrations%' order by c.relname`;
  const columns =
    await tx`select c.relname as table_name,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) as expression,co.collname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum left join pg_collation co on co.oid=a.attcollation where n.nspname=${namespace} and c.relkind in ('r','p','v','m') and c.relname not like '__drizzle_migrations%' and a.attnum>0 and not a.attisdropped order by c.relname,a.attname`;
  const constraints =
    await tx`select c.relname as table_name,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=${namespace} and c.relname not like '__drizzle_migrations%' order by c.relname,k.conname`;
  const indexes =
    await tx`select c.relname as table_name,ix.relname as name,i.indisvalid,i.indisready,i.indisunique,pg_get_indexdef(i.indexrelid) as definition from pg_index i join pg_class c on c.oid=i.indrelid join pg_class ix on ix.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=${namespace} and c.relname not like '__drizzle_migrations%' order by c.relname,ix.relname`;
  const enums =
    await tx`select t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname=${namespace} order by t.typname,e.enumsortorder`;
  const functions =
    await tx`select p.proname,pg_get_functiondef(p.oid) as definition,p.prosecdef,p.proconfig,p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=${namespace} and p.prokind='f' order by p.proname,pg_get_function_identity_arguments(p.oid)`;
  const triggers =
    await tx`select c.relname as table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=${namespace} and not t.tgisinternal order by c.relname,t.tgname`;
  const policies =
    await tx`select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname=${namespace} order by tablename,policyname`;
  const normalized = JSON.stringify({
    tables,
    columns,
    constraints,
    indexes,
    enums,
    functions,
    triggers,
    policies,
  })
    .replaceAll(`\\"${namespace}\\".`, "SCHEMA.")
    .replaceAll(`${namespace}.`, "SCHEMA.");
  return JSON.parse(normalized) as Record<string, unknown[]>;
}
