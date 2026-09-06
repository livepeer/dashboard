import { randomUUID } from "node:crypto";
import type { ProviderIdentity } from "@/lib/platform/contracts";

export function createFixtureNamespace() {
  const prefix = `qa-${randomUUID()}`;
  const key = (name: string) => {
    if (!/^[a-z0-9-]{1,24}$/.test(name)) {
      throw new Error("Fixture labels must be short lowercase identifiers");
    }
    return `${prefix}-${name}`;
  };
  return {
    prefix,
    email: (name: string) => `${key(name)}@example.invalid`,
    subject: (name: string) => `synthetic|${key(name)}`,
  };
}

/** Synthetic session DTO only; it does not bypass a real provider adapter. */
export function mockProviderIdentity(
  overrides: Partial<ProviderIdentity> = {}
): ProviderIdentity {
  const namespace = createFixtureNamespace();
  const result: ProviderIdentity = {
    authority: "synthetic",
    issuer: "https://identity.example.invalid/",
    subject: namespace.subject("user"),
    email: namespace.email("user"),
    emailVerified: true,
    ...overrides,
  };
  if (
    result.email &&
    !result.email.toLowerCase().endsWith("@example.invalid")
  ) {
    throw new Error(
      "Synthetic identities must not use deliverable email addresses"
    );
  }
  return result;
}

export type FixtureCleanupDomain = {
  domain: string;
  deleteIds: (ids: readonly string[]) => Promise<void>;
};

/**
 * Register domains in child-before-parent foreign-key order. Cleanup stops on
 * failure and retains unprocessed IDs for retry. Never scans or truncates data.
 * Callers must track only IDs returned by their own synthetic fixture inserts.
 */
export class FixtureLedger {
  private readonly domains: FixtureCleanupDomain[];
  private readonly ids = new Map<string, Set<string>>();
  private cleaning = false;

  constructor(domains: readonly FixtureCleanupDomain[]) {
    this.domains = domains.map((entry) => ({ ...entry }));
    for (const { domain } of this.domains) {
      if (!domain || this.ids.has(domain)) {
        throw new Error("Fixture domains must have distinct nonempty names");
      }
      this.ids.set(domain, new Set());
    }
  }

  track(domain: string, id: string): string {
    if (this.cleaning) throw new Error("Cannot track fixtures during cleanup");
    const ids = this.ids.get(domain);
    if (!ids) throw new Error("Unregistered fixture domain");
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      throw new Error("Fixture cleanup requires exact UUID record IDs");
    }
    ids.add(id);
    return id;
  }

  counts(): Record<string, number> {
    return Object.fromEntries(
      [...this.ids].map(([domain, ids]) => [domain, ids.size])
    );
  }

  async cleanup(): Promise<void> {
    if (this.cleaning)
      throw new Error("Fixture cleanup is already in progress");
    this.cleaning = true;
    try {
      for (const { domain, deleteIds } of this.domains) {
        const ids = this.ids.get(domain)!;
        if (!ids.size) continue;
        await deleteIds(Object.freeze([...ids]));
        ids.clear();
      }
    } finally {
      this.cleaning = false;
    }
  }
}
