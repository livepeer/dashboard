import { requireConsolePage } from "@/lib/access/page";
import { parseDeviceInitiateParams } from "@/lib/console/device-approval";
import DeviceApproveForm, { DevicePageChrome } from "./DeviceApproveForm";

export const dynamic = "force-dynamic";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{
    iss?: string;
    target_link_uri?: string;
    login_hint?: string;
  }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.iss) query.set("iss", params.iss);
  if (params.target_link_uri)
    query.set("target_link_uri", params.target_link_uri);
  if (params.login_hint) query.set("login_hint", params.login_hint);
  const returnTo = `/device${query.size ? `?${query.toString()}` : ""}`;

  await requireConsolePage(returnTo);

  let parsed;
  try {
    parsed = parseDeviceInitiateParams(query);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid device request";
    return (
      <DevicePageChrome>
        <p className="text-sm text-red-400">{message}</p>
      </DevicePageChrome>
    );
  }

  return (
    <DevicePageChrome>
      <DeviceApproveForm
        iss={parsed.issuer}
        targetLinkUri={parsed.targetLinkUri}
        userCode={parsed.userCode}
        clientId={parsed.clientId}
      />
    </DevicePageChrome>
  );
}
