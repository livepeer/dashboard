import "server-only";

import {
  getUtcCalendarMonthIsoBounds,
  PmtHouseClient,
  PmtHouseError,
} from "@pymthouse/builder-sdk";
import type {
  AccountRequestsPayload,
  AccountUsageBalance,
  AccountUsagePayload,
  AccountUsagePipelineRow,
} from "@/lib/console/account-usage";
import {
  issuerOriginFromConfig,
  readPublicClientId,
  requirePymthouseM2mConfig,
} from "@/lib/console/pymthouse-http";
import {
  dailyRequestSeriesForPipeline,
  utcDateKeysForPeriod,
} from "@/lib/console/usage-capability-display";
import { historyRange } from "@/lib/console/history-range";
import { takeGatewayRequestIds } from "@/lib/console/gateway-request-ids";
import { isUserNotFoundError } from "@/lib/console/pymthouse-errors";

export type {
  AccountRequestsPayload,
  AccountUsagePayload,
} from "@/lib/console/account-usage";

export { isUserNotFoundError } from "@/lib/console/pymthouse-errors";

export function createPmtHouseClientForPublicApp(
  publicClientId: string
): PmtHouseClient {
  const config = requirePymthouseM2mConfig();
  return new PmtHouseClient({
    issuerUrl: config.issuerUrl,
    publicClientId,
    m2mClientId: config.m2mClientId,
    m2mClientSecret: config.m2mClientSecret,
    allowInsecureHttp: config.allowInsecureHttp,
  });
}

export async function ensureDashboardAppUser(
  externalUserId: string,
  email?: string
): Promise<void> {
  const client = createPmtHouseClientForPublicApp(readPublicClientId());
  await client.upsertAppUser({
    externalUserId,
    ...(email ? { email } : {}),
  });
}

export async function mintEndUserAccessToken(
  externalUserId: string,
  email?: string
): Promise<{
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}> {
  const client = createPmtHouseClientForPublicApp(readPublicClientId());
  try {
    return await client.mintUserAccessToken({
      externalUserId,
      scope: "sign:job",
    });
  } catch (error) {
    if (isUserNotFoundError(error)) {
      await ensureDashboardAppUser(externalUserId, email);
      return client.mintUserAccessToken({
        externalUserId,
        scope: "sign:job",
      });
    }
    throw error;
  }
}

/** Last `days` UTC calendar days inclusive of today — not a trailing clock window. */
function rollingPeriodDays(
  days: number,
  now = new Date()
): {
  startDate: string;
  endDate: string;
  priorStartDate: string;
  priorEndDate: string;
} {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);

  const priorEnd = new Date(start);
  priorEnd.setUTCMilliseconds(priorEnd.getUTCMilliseconds() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (days - 1));
  priorStart.setUTCHours(0, 0, 0, 0);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    priorStartDate: priorStart.toISOString(),
    priorEndDate: priorEnd.toISOString(),
  };
}

function mtdPeriodBounds(now = new Date()): {
  startDate: string;
  endDate: string;
  priorStartDate: string;
  priorEndDate: string;
} {
  const { startDate, endDate } = getUtcCalendarMonthIsoBounds(now);
  const monthStart = new Date(startDate);
  const priorEnd = new Date(monthStart.getTime() - 1);
  const priorStart = new Date(
    Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  return {
    startDate,
    endDate,
    priorStartDate: priorStart.toISOString(),
    priorEndDate: priorEnd.toISOString(),
  };
}

async function fetchUsageBalance(
  client: PmtHouseClient,
  externalUserId: string
): Promise<AccountUsageBalance | null> {
  try {
    const balance = await client.getUsageBalance(externalUserId);
    return {
      externalUserId: balance.externalUserId ?? externalUserId,
      balanceUsdMicros: balance.balanceUsdMicros ?? "0",
      consumedUsdMicros: balance.consumedUsdMicros ?? "0",
      lifetimeGrantedUsdMicros: balance.lifetimeGrantedUsdMicros ?? "0",
      hasAccess: Boolean(balance.hasAccess),
    };
  } catch {
    return null;
  }
}

export async function fetchAccountUsageForExternalUser(input: {
  externalUserId: string;
  periodDays?: number;
  /** `rolling` = last `periodDays` UTC calendar days inclusive of today; `mtd` = current UTC month. */
  window?: "rolling" | "mtd";
  includePrior?: boolean;
}): Promise<AccountUsagePayload> {
  const publicClientId = readPublicClientId();
  const includePrior = input.includePrior !== false;
  const period =
    input.window === "mtd"
      ? mtdPeriodBounds()
      : rollingPeriodDays(input.periodDays ?? 30);

  const client = createPmtHouseClientForPublicApp(publicClientId);

  const [balance, currentScope, priorScope] = await Promise.all([
    fetchUsageBalance(client, input.externalUserId),
    client.fetchUsageForExternalUser({
      externalUserId: input.externalUserId,
      startDate: period.startDate,
      endDate: period.endDate,
      includeRetail: true,
    }),
    includePrior
      ? client.fetchUsageForExternalUser({
          externalUserId: input.externalUserId,
          startDate: period.priorStartDate,
          endDate: period.priorEndDate,
          includeRetail: true,
        })
      : Promise.resolve(null),
  ]);

  const periodBounds = { start: period.startDate, end: period.endDate };
  const dayKeys = utcDateKeysForPeriod(periodBounds.start, periodBounds.end);
  const dailyByPipeline = (currentScope.currentUser.dailyByPipeline ?? []).map(
    (row) => ({
      pipeline: row.pipeline,
      modelId: row.modelId,
      date: row.date,
      requestCount: row.requestCount,
      networkFeeUsdMicros: row.networkFeeUsdMicros,
    })
  );

  const mapPipeline = (
    rows: typeof currentScope.currentUser.pipelineModels,
    seriesDayKeys: string[],
    seriesDaily: typeof dailyByPipeline
  ): AccountUsagePipelineRow[] =>
    rows.map((row) => ({
      pipeline: row.pipeline,
      modelId: row.modelId,
      requestCount: row.requestCount,
      networkFeeUsdMicros: row.networkFeeUsdMicros,
      endUserBillableUsdMicros: row.endUserBillableUsdMicros,
      dailyRequests: dailyRequestSeriesForPipeline({
        pipeline: row.pipeline,
        modelId: row.modelId,
        dayKeys: seriesDayKeys,
        dailyByPipeline: seriesDaily,
      }),
    }));

  return {
    clientId: currentScope.clientId,
    period: periodBounds,
    periodDayKeys: dayKeys,
    priorPeriod: { start: period.priorStartDate, end: period.priorEndDate },
    balance,
    current: {
      requestCount: currentScope.currentUser.requestCount,
      networkFeeUsdMicros: currentScope.currentUser.networkFeeUsdMicros,
      endUserBillableUsdMicros:
        currentScope.currentUser.endUserBillableUsdMicros,
      pipelineModels: mapPipeline(
        currentScope.currentUser.pipelineModels,
        dayKeys,
        dailyByPipeline
      ),
      dailyByPipeline,
    },
    prior: priorScope
      ? {
          requestCount: priorScope.currentUser.requestCount,
          pipelineModels: mapPipeline(
            priorScope.currentUser.pipelineModels,
            utcDateKeysForPeriod(period.priorStartDate, period.priorEndDate),
            []
          ),
        }
      : {
          requestCount: 0,
          pipelineModels: [],
        },
  };
}

export async function fetchAccountRequestsForExternalUser(input: {
  externalUserId: string;
  email?: string;
  cursor?: string | null;
  limit?: number;
  gatewayRequestIds?: string[];
}): Promise<AccountRequestsPayload> {
  const publicClientId = readPublicClientId();
  const minted = await mintEndUserAccessToken(
    input.externalUserId,
    input.email
  );
  const accessToken = minted.access_token;

  const url = new URL(`${issuerOriginFromConfig()}/api/v1/user/usage/requests`);
  const range = historyRange();
  url.searchParams.set("from", range.from);
  url.searchParams.set("to", range.to);
  if (input.cursor && !input.gatewayRequestIds?.length)
    url.searchParams.set("cursor", input.cursor);
  if (input.limit != null) url.searchParams.set("limit", String(input.limit));
  for (const id of takeGatewayRequestIds(input.gatewayRequestIds ?? [])) {
    url.searchParams.append("gatewayRequestId", id);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const raw = await response.text();
  let body: (AccountRequestsPayload & { error?: string }) | null = null;
  try {
    body = raw
      ? (JSON.parse(raw) as AccountRequestsPayload & { error?: string })
      : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const notDeployed =
      response.status === 404
        ? " End-user usage/requests is not available on this PymtHouse deployment yet."
        : "";
    throw new PmtHouseError(
      (body?.error ?? `Signed-ticket requests failed (${response.status})`) +
        notDeployed,
      {
        status: response.status,
        code: "pymthouse_http_error",
        details: body ?? undefined,
      }
    );
  }

  return {
    // Request metadata outlives shared media URLs. Never age out rows or stop
    // pagination because of their date or media availability.
    items: body?.items ?? [],
    nextCursor: body?.nextCursor ?? null,
    openMeterConfigured: body?.openMeterConfigured !== false,
    clientId: body?.clientId ?? publicClientId,
    externalUserId: body?.externalUserId ?? input.externalUserId,
  };
}
