import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { openIntegrationDatabase } from "@/tests/support/isolated-db";
import { seedPreviewContactRows } from "@/scripts/early-access/seed-preview";

it.skipIf(!process.env.TEST_DATABASE_URL)(
  "seeds representative contacts once without modifying users/admins or queuing delivery",
  async () => {
    const { client } = await openIntegrationDatabase(process.env);
    const rollback = new Error("rollback_preview_seed_rehearsal");
    try {
      await expect(
        client.begin(async (tx) => {
          const namespace = `seed_${randomUUID().replaceAll("-", "")}`;
          await tx.unsafe(`CREATE SCHEMA "${namespace}"`);
          await tx.unsafe(`SET LOCAL search_path TO "${namespace}",public`);
          const journal = JSON.parse(
            readFileSync("drizzle-baseline/meta/_journal.json", "utf8")
          );
          for (const entry of journal.entries) {
            for (const statement of readFileSync(
              `drizzle-baseline/${entry.tag}.sql`,
              "utf8"
            ).split("--> statement-breakpoint"))
              if (statement.trim())
                await tx.unsafe(
                  statement.replaceAll('"public".', `"${namespace}".`)
                );
          }
          const [user] =
            await tx`insert into users default values returning id`;
          const [signup] =
            await tx`insert into waitlist_signups(email,normalized_email,referral_code,status,confirmed_at,user_id,first_touch,last_touch) values('existing@example.invalid','existing@example.invalid','existing','confirmed',now(),${user.id},'{}','{}') returning id`;
          await tx`insert into admin_role_grants(signup_id,source) values(${signup.id},'synthetic_existing_admin')`;
          expect(await seedPreviewContactRows(tx, true)).toMatchObject({
            created: 150,
            canonicalUsersCreated: 0,
            adminGrantsCreated: 0,
            outboxEventsCreated: 0,
          });
          expect(await seedPreviewContactRows(tx, true)).toMatchObject({
            existing: 150,
            created: 0,
          });
          const [counts] =
            await tx`select (select count(*)::int from users) as users,(select count(*)::int from admin_role_grants) as admins,(select count(*)::int from waitlist_signups) as contacts,(select count(*)::int from email_outbox) as outbox,(select count(*)::int from email_subscriptions where status='subscribed') as subscribed,(select count(*)::int from access_grants where status='approved') as approved,(select count(*)::int from access_grants where status='revoked') as revoked,(select count(*)::int from point_events) as referrals,(select count(*)::int from access_events) as access_events`;
          expect(counts).toEqual({
            users: 1,
            admins: 1,
            contacts: 151,
            outbox: 0,
            subscribed: 50,
            approved: 30,
            revoked: 15,
            referrals: 30,
            access_events: 60,
          });
          throw rollback;
        })
      ).rejects.toBe(rollback);
    } finally {
      await client.end();
    }
  },
  30000
);
