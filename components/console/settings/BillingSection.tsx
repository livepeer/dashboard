"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Box,
  Check,
  CreditCard,
  Download,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/console/AuthContext";
import Dialog from "@/components/design-system/Dialog";
import TimingChoicePanel from "@/components/console/TimingChoicePanel";
import {
  IconButton,
  SettingsCard,
  SettingsHeader,
  ST_COLS_5,
  ST_HEAD_CLASS,
} from "./SettingsPrimitives";
import {
  ResumeSubscriptionError,
  ScheduledChangeConflictError,
  useBillingPlans,
} from "@/lib/console/useBillingPlans";
import { useBillingAccount } from "@/lib/console/useBillingAccount";
import { redirectToCheckout } from "@/lib/console/checkout-redirect";
import {
  startWalletTopUp,
  useWalletBillingState,
} from "@/lib/console/useOwnerWallet";
import {
  SESSION_USAGE_OPTIONS,
  useAccountUsage,
} from "@/lib/console/useAccountUsage";
import {
  includedUsageRemainingLabel,
  includedUsageSummaryFromBalance,
  formatWalletUsd,
  overageLimitNote,
} from "@/lib/console/wallet-settlement-display";
import type {
  DashboardBillingPlan,
  DashboardScheduledChangeConflict,
} from "@/lib/console/pymthouse-billing";
import {
  billingPlanActionLabel,
  canCancelBillingSubscription,
  defaultCancelTimingChoice,
  deriveBillingPlanAction,
  deriveBillingSubscriptionUiState,
  formatBillingPlanPrice,
  formatPendingCancelDate,
  isActiveSubscriptionConflict,
  isNothingToResumeError,
  paidCatalogPlanIds,
  resolveApplicablePendingCancel,
  resolveCancelingEffectiveAt,
  resolveCancelingPlanName,
  resolveTimingPayload,
  includedUsageFeatureLabel,
  toDateInputValue,
  withCurrentPlanInDisplayList,
  type BillingPlanAction,
  type SubscriptionTimingChoice,
} from "@/lib/console/billing-subscription-state";

function isUsagePlan(
  plan: Pick<DashboardBillingPlan, "type" | "isStarterDefault">
): boolean {
  if (plan.isStarterDefault) return false;
  return plan.type.trim().toLowerCase() === "usage";
}

function resolvedPayPerUseBehavior(plan: DashboardBillingPlan): string {
  const resolved = plan.resolvedBehavior?.trim();
  if (resolved) {
    return resolved;
  }

  return "Pay-per-use — usage draws down prepaid credits first, then is invoiced automatically as it accrues.";
}

function formatInvoiceAmount(totalAmount: string, currency: string): string {
  const n = Number(totalAmount);
  if (!Number.isFinite(n)) return `${totalAmount} ${currency}`;
  // OpenMeter invoice totals are decimal dollar strings (e.g. "2.50").
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(n);
}

function formatInvoiceDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubscriptionHistoryStatus(input: {
  status: string;
  current: boolean;
}): string {
  if (input.current) return "Current";
  const status = input.status.trim().toLowerCase();
  if (status === "scheduled" || status === "pending") return "Scheduled";
  if (
    status === "inactive" ||
    status === "canceled" ||
    status === "cancelled"
  ) {
    return "Ended";
  }
  return input.status || "—";
}

function readCheckoutFlash(): "success" | "cancel" | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("checkout");
  if (value === "success" || value === "cancel") return value;
  return null;
}

/** Outcome of a returning wallet top-up Checkout. */
function readTopUpFlash(): "succeeded" | "canceled" | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("topup");
  if (value === "succeeded" || value === "canceled") return value;
  return null;
}

/** Plan id to finish switching after setup-mode Checkout returns. */
function readResumePlanChange(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search)
    .get("changePlan")
    ?.trim();
  return value || null;
}

function clearCheckoutQueryParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["checkout", "changePlan", "topup"] as const) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

function billingChangePlanSuccessUrl(planId: string): string {
  const url = new URL("/home", window.location.origin);
  url.searchParams.set("checkout", "success");
  url.searchParams.set("changePlan", planId);
  return url.toString();
}

function billingChangePlanCancelUrl(): string {
  return `${window.location.origin}/home?checkout=cancel`;
}

/**
 * Organization · Billing — live plan, payment method, and invoices.
 * Fake company/tax/address “Billing details” removed (no API).
 */
export default function BillingSection() {
  const { isConnected } = useAuth();
  const {
    state: plansState,
    reload: reloadPlans,
    subscribe,
    changePlan,
    cancelSubscription,
    resumeSubscription,
  } = useBillingPlans(isConnected);
  const {
    state: accountState,
    reload: reloadAccount,
    startPaymentMethodCheckout,
    openInvoice,
    setDefaultPaymentMethod,
    ensureDefaultPaymentMethod,
    removePaymentMethod,
  } = useBillingAccount(isConnected);
  const wallet = useWalletBillingState(isConnected);
  const usage = useAccountUsage(isConnected, SESSION_USAGE_OPTIONS);

  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [pmBusy, setPmBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [paymentMethodActionId, setPaymentMethodActionId] = useState<
    string | null
  >(null);
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<"success" | "cancel" | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("25.00");
  const [topUpBusy, setTopUpBusy] = useState(false);

  const creditsUsd =
    wallet.state.status === "ready"
      ? Number(wallet.state.wallet.balance?.usdMicros ?? "0") / 1_000_000
      : 0;
  const overageNote =
    wallet.state.status === "ready"
      ? overageLimitNote(wallet.state.wallet.billingState)
      : null;

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelChoice, setCancelChoice] = useState<SubscriptionTimingChoice>(
    defaultCancelTimingChoice()
  );
  const [cancelCustomDate, setCancelCustomDate] = useState("");
  const [changeDialog, setChangeDialog] = useState<{
    planId: string;
    conflict: DashboardScheduledChangeConflict | null;
  } | null>(null);
  const [changeChoice, setChangeChoice] =
    useState<SubscriptionTimingChoice>("immediate");
  const [changeCustomDate, setChangeCustomDate] = useState("");

  async function onAddFunds() {
    if (!isConnected) return;
    setError(null);
    setTopUpBusy(true);
    try {
      const { checkoutUrl } = await startWalletTopUp({
        amountUsd: topUpAmount.trim(),
        returnPath: "/home",
      });
      redirectToCheckout(checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
      setTopUpBusy(false);
    }
  }

  // Checkout returns here after a top-up; confirm it and refresh the balance.
  useEffect(() => {
    const topUp = readTopUpFlash();
    if (!topUp) return;
    clearCheckoutQueryParam();
    setTopUpOpen(false);
    if (topUp === "succeeded") {
      setBillingNotice(
        "Funds added. The balance updates once Stripe settles the payment."
      );
      void wallet.reload();
    } else {
      setBillingNotice("Top-up canceled.");
    }
    // Runs once on return from Checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = readCheckoutFlash();
    const resumePlanId = readResumePlanChange();
    if (!next && !resumePlanId) return;
    // Wait for auth before consuming a resume intent from the return URL.
    if (resumePlanId && !isConnected) return;

    if (next) setFlash(next);
    clearCheckoutQueryParam();
    if (next === "success") {
      void (async () => {
        if (isConnected) {
          try {
            await ensureDefaultPaymentMethod();
          } catch {
            // Webhook may already have promoted; list/UI still refreshes.
          }
        }
        if (resumePlanId && isConnected) {
          setBusyPlanId(resumePlanId);
          try {
            await runChangePlan(resumePlanId);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not finish plan change after adding a card"
            );
          } finally {
            setBusyPlanId(null);
          }
          return;
        }
        void reloadPlans();
        void reloadAccount();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once from return URL
  }, [isConnected, ensureDefaultPaymentMethod, reloadPlans, reloadAccount]);

  async function ensurePaymentMethodForUsagePlan(planId: string) {
    if (!isConnected) return;
    const plan = (plansState.status === "ready" ? plansState.plans : []).find(
      (p) => p.id === planId
    );
    if (!plan || !isUsagePlan(plan)) return;

    // Pay-per-use needs a card for threshold auto-debit. If plan change did
    // not return Checkout (older pymthouse), start setup-mode Checkout here.
    try {
      const { checkoutUrl } = await startPaymentMethodCheckout();
      redirectToCheckout(checkoutUrl);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Payment method checkout failed";
      setBillingNotice(
        "Pay-per-use plan is active. Add a card below so usage can auto-debit after prepaid credits."
      );
      setError(message);
    }
  }

  async function runChangePlan(
    planId: string,
    timing?: {
      timing?: string;
      effectiveAt?: string;
      confirmReplaceScheduled?: boolean;
    }
  ) {
    if (!isConnected) return;
    const result = await changePlan({
      planId,
      successUrl: billingChangePlanSuccessUrl(planId),
      cancelUrl: billingChangePlanCancelUrl(),
      ...timing,
    });
    if (result.checkoutUrl) {
      redirectToCheckout(result.checkoutUrl);
      return;
    }
    await reloadPlans();
    setBillingNotice("Your plan has been updated.");
    await ensurePaymentMethodForUsagePlan(planId);
  }

  function openChangeTimingDialog(
    planId: string,
    conflict: DashboardScheduledChangeConflict | null = null
  ) {
    setChangeChoice(defaultCancelTimingChoice());
    setChangeCustomDate(
      toDateInputValue(
        conflict?.timingOptions?.minEffectiveAt ??
          subscription?.timingOptions?.change.minEffectiveAt
      )
    );
    setChangeDialog({ planId, conflict });
  }

  async function onPlanAction(planId: string, action: BillingPlanAction) {
    if (!isConnected) {
      setError("Sign in to subscribe.");
      return;
    }
    if (action === "current") {
      return;
    }

    setError(null);
    setBillingNotice(null);
    setBusyPlanId(planId);
    try {
      if (action === "change_plan") {
        const catalog = plansState.status === "ready" ? plansState.plans : [];
        const liveSubscription =
          plansState.status === "ready" ? plansState.subscription : null;
        const targetPlan = withCurrentPlanInDisplayList(
          catalog,
          liveSubscription
        ).find((p) => p.id === planId);
        // Starter downgrades schedule silently without timing — prompt first.
        if (targetPlan?.isStarterDefault === true) {
          setBusyPlanId(null);
          openChangeTimingDialog(planId);
          return;
        }
        try {
          await runChangePlan(planId);
        } catch (err) {
          if (err instanceof ScheduledChangeConflictError) {
            openChangeTimingDialog(planId, err.conflict);
            return;
          }
          throw err;
        }
        return;
      }

      const input = {
        planId:
          action === "retry_checkout"
            ? (subscriptionUiState.planId ?? planId)
            : planId,
        successUrl: billingChangePlanSuccessUrl(
          action === "retry_checkout"
            ? (subscriptionUiState.planId ?? planId)
            : planId
        ),
        cancelUrl: billingChangePlanCancelUrl(),
      };
      const result = await subscribe(input);

      if (result.checkoutUrl) {
        redirectToCheckout(result.checkoutUrl);
        return;
      }

      await reloadPlans();
      setBillingNotice("Your plan has been updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      if (isActiveSubscriptionConflict(message)) {
        setBillingNotice(
          "You already have a subscription. Choose another plan to switch, or complete payment for your current plan."
        );
        await reloadPlans();
      } else {
        setError(message);
      }
    } finally {
      setBusyPlanId(null);
    }
  }

  function openCancelDialog() {
    setCancelChoice(defaultCancelTimingChoice());
    setCancelCustomDate(
      toDateInputValue(subscription?.timingOptions?.cancel.minEffectiveAt)
    );
    setCancelDialogOpen(true);
  }

  async function onConfirmCancel() {
    if (!isConnected) {
      setError("Sign in to cancel.");
      return;
    }
    setError(null);
    setBillingNotice(null);
    setLifecycleBusy(true);
    try {
      const payload = resolveTimingPayload({
        choice: cancelChoice,
        customDateYmd: cancelCustomDate,
      });
      await cancelSubscription(payload);
      setCancelDialogOpen(false);
      await reloadPlans();
      setBillingNotice(
        cancelChoice === "immediate"
          ? "Your subscription has been canceled."
          : `Cancellation scheduled${
              payload.effectiveAt
                ? ` for ${formatPendingCancelDate(payload.effectiveAt)}`
                : " for the end of this period"
            }.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not cancel subscription"
      );
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function onConfirmChangeTiming() {
    if (!isConnected || !changeDialog) return;
    setError(null);
    setBillingNotice(null);
    setBusyPlanId(changeDialog.planId);
    try {
      const payload = resolveTimingPayload({
        choice: changeChoice,
        customDateYmd: changeCustomDate,
      });
      await runChangePlan(changeDialog.planId, {
        ...payload,
        ...(changeDialog.conflict ? { confirmReplaceScheduled: true } : {}),
      });
      setChangeDialog(null);
    } catch (err) {
      if (err instanceof ScheduledChangeConflictError) {
        openChangeTimingDialog(changeDialog.planId, err.conflict);
        return;
      }
      setError(
        err instanceof Error ? err.message : "Could not change subscription"
      );
    } finally {
      setBusyPlanId(null);
    }
  }

  async function onCancelSubscription() {
    openCancelDialog();
  }

  async function onResumeSubscription() {
    if (!isConnected) {
      setError("Sign in to restore your plan.");
      return;
    }
    setError(null);
    setBillingNotice(null);
    setFlash(null);
    setLifecycleBusy(true);
    try {
      await resumeSubscription();
      await reloadPlans();
      setBillingNotice("Your plan will continue — cancellation removed.");
    } catch (err) {
      // Nothing left to undo upstream — the local snapshot is stale, so reload
      // it and drop the banner rather than stranding an error.
      if (
        err instanceof ResumeSubscriptionError &&
        isNothingToResumeError(err.code)
      ) {
        await reloadPlans();
        setBillingNotice(
          "No scheduled cancellation is pending — your plan is up to date."
        );
        return;
      }
      setError(
        err instanceof Error ? err.message : "Could not restore subscription"
      );
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function onAddCard() {
    if (!isConnected) {
      setError("Sign in to add a payment method.");
      return;
    }
    setError(null);
    setPmBusy(true);
    try {
      const { checkoutUrl } = await startPaymentMethodCheckout();
      redirectToCheckout(checkoutUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Payment method checkout failed"
      );
      setPmBusy(false);
    }
  }

  async function onOpenInvoice(invoiceId: string, prefer: "hosted" | "pdf") {
    if (!isConnected) return;
    setError(null);
    setInvoiceBusyId(invoiceId);
    try {
      const links = await openInvoice({ invoiceId });
      const url =
        prefer === "pdf"
          ? links.invoicePdf || links.hostedInvoiceUrl
          : links.hostedInvoiceUrl || links.invoicePdf;
      if (!url) {
        throw new Error(
          invoiceId.startsWith("pi_")
            ? "No Stripe receipt for this top-up yet."
            : "No Stripe invoice page for this invoice yet."
        );
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open invoice");
    } finally {
      setInvoiceBusyId(null);
    }
  }

  async function onSetDefaultPaymentMethod(paymentMethodId: string) {
    if (!isConnected) return;
    setError(null);
    setPaymentMethodActionId(paymentMethodId);
    try {
      await setDefaultPaymentMethod({ paymentMethodId });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not set default payment method"
      );
    } finally {
      setPaymentMethodActionId(null);
    }
  }

  async function onRemovePaymentMethod(paymentMethodId: string) {
    if (!isConnected) return;
    if (!window.confirm("Remove this payment method?")) return;
    setError(null);
    setPaymentMethodActionId(paymentMethodId);
    try {
      await removePaymentMethod({ paymentMethodId });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove payment method"
      );
    } finally {
      setPaymentMethodActionId(null);
    }
  }

  const plansLoading =
    plansState.status === "loading" || plansState.status === "idle";
  const accountLoading =
    accountState.status === "loading" || accountState.status === "idle";

  const catalogPlans = plansState.status === "ready" ? plansState.plans : [];
  const subscription =
    plansState.status === "ready" ? plansState.subscription : null;
  const plans = withCurrentPlanInDisplayList(
    catalogPlans,
    subscription
  ) as DashboardBillingPlan[];
  const subscriptionUiState = deriveBillingSubscriptionUiState(subscription);
  const paymentMethods =
    accountState.status === "ready" ? accountState.paymentMethods : [];
  const invoices = accountState.status === "ready" ? accountState.invoices : [];
  const subscriptions =
    accountState.status === "ready" ? accountState.subscriptions : [];
  const paymentMethodsError =
    accountState.status === "ready" ? accountState.paymentMethodsError : null;
  const invoicesError =
    accountState.status === "ready" ? accountState.invoicesError : null;
  const subscriptionsError =
    accountState.status === "ready" ? accountState.subscriptionsError : null;

  const cancelingPlanName = resolveCancelingPlanName(subscription);
  const cancelingEndsAt = resolveCancelingEffectiveAt(subscription);
  const cancelingEndsLabel = formatPendingCancelDate(cancelingEndsAt);

  const included =
    usage.status === "ready"
      ? includedUsageSummaryFromBalance(
          usage.data.balance,
          subscription
            ? { id: subscription.planId, name: subscription.planName }
            : undefined
        )
      : null;

  const planSub =
    subscriptionUiState.kind === "canceling"
      ? `${cancelingPlanName} ends ${cancelingEndsLabel}`
      : included
        ? includedUsageRemainingLabel(included)
        : subscription?.planName?.trim() ||
          (subscriptionUiState.kind === "pending"
            ? "Payment needs to be completed"
            : subscriptionUiState.kind === "active"
              ? "Current subscription"
              : "Choose a plan to get started");

  // Starter is the floor — cancel is only for paid catalog plans.
  const canCancel = canCancelBillingSubscription(
    subscriptionUiState,
    paidCatalogPlanIds(catalogPlans),
    Boolean(isConnected)
  );
  const canResume =
    Boolean(isConnected) &&
    Boolean(resolveApplicablePendingCancel(subscription));
  const showCancelingBanner = subscriptionUiState.kind === "canceling";

  return (
    <div>
      {flash === "success" ? (
        <p className="mb-4 text-[13px] text-emerald-400">
          Checkout completed — billing details refreshed.
        </p>
      ) : null}
      {flash === "cancel" ? (
        <p className="mb-4 text-[13px] text-fg-muted">Checkout canceled.</p>
      ) : null}
      {billingNotice ? (
        <p className="mb-4 text-[13px] text-green-bright" role="status">
          {billingNotice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 text-[13px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {showCancelingBanner ? (
        <div className="mb-4 rounded-md border border-hairline bg-dark-lighter px-4 py-4">
          <p className="text-[13.5px] font-medium text-fg">
            Ends at end of current period
          </p>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            {cancelingPlanName} stays active until {cancelingEndsLabel}. You
            chose to let it expire at the end of the current period — access
            continues until then. Switching to another plan replaces this
            remaining period.
          </p>
          {canResume ? (
            <button
              type="button"
              className="mt-3 rounded-md bg-green-bright px-3 py-1.5 text-[12.5px] font-medium text-black disabled:opacity-50"
              disabled={lifecycleBusy}
              onClick={() => void onResumeSubscription()}
            >
              {lifecycleBusy ? "Restoring…" : `Keep ${cancelingPlanName}`}
            </button>
          ) : null}
        </div>
      ) : null}

      <SettingsHeader
        title="Plan"
        sub={planSub ?? undefined}
        action={
          canCancel ? (
            <button
              type="button"
              className="text-[12.5px] text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline disabled:opacity-50"
              disabled={lifecycleBusy || busyPlanId !== null}
              onClick={() => void onCancelSubscription()}
            >
              {lifecycleBusy ? "Canceling…" : "Cancel subscription"}
            </button>
          ) : canResume ? (
            <button
              type="button"
              className="text-[12.5px] text-green-bright underline-offset-2 hover:underline disabled:opacity-50"
              disabled={lifecycleBusy}
              onClick={() => void onResumeSubscription()}
            >
              {lifecycleBusy ? "Restoring…" : "Restore plan"}
            </button>
          ) : undefined
        }
      />
      <SettingsCard>
        {plansLoading ? (
          <div className="animate-pulse p-[18px]">
            <div className="h-4 w-40 rounded bg-white/5" />
            <div className="mt-3 h-24 rounded bg-white/5" />
          </div>
        ) : plansState.status === "error" ? (
          <div className="p-[18px]">
            <p className="text-[13px] text-fg-muted">Could not load plans.</p>
            <p className="mt-1 font-mono text-[12px] text-fg-faint">
              {plansState.message}
            </p>
            <button
              type="button"
              className="mt-3 text-[12.5px] text-fg-strong underline"
              onClick={() => void reloadPlans()}
            >
              Retry
            </button>
          </div>
        ) : plans.length === 0 ? (
          <div className="px-5 py-9 text-center">
            <p className="text-[13.5px] text-fg-muted">
              No paid plans are published for this app yet.
            </p>
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 ${
              // Column count follows the plan count. A fixed 3 left a dead
              // column whenever fewer plans were published, which reads as
              // two cards of unequal width rather than an empty slot.
              plans.length === 1
                ? "md:grid-cols-1"
                : plans.length === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-3"
            }`}
          >
            {plans.map((plan, index) => {
              const action = deriveBillingPlanAction(
                subscriptionUiState,
                plan.id
              );
              const isCurrent = action === "current";
              const isPending =
                subscriptionUiState.kind === "pending" &&
                subscriptionUiState.planId === plan.id;
              const { price, priceSub } = formatBillingPlanPrice(plan);
              const isStarter =
                plan.isStarterDefault === true ||
                plan.type.trim().toLowerCase() === "free";
              const includedUsage = includedUsageFeatureLabel(plan);
              const features: string[] = [];
              if (
                isCurrent &&
                included &&
                (included.planId === plan.id || !included.planId)
              ) {
                features.push(
                  `$${included.remainingUsd} of $${included.totalUsd} included left`
                );
              }
              if (isUsagePlan(plan)) {
                features.push(resolvedPayPerUseBehavior(plan));
              } else {
                if (includedUsage) {
                  features.push(includedUsage);
                } else if (isStarter) {
                  features.push("Free included usage");
                }
                if (!isStarter) {
                  features.push(
                    plan.billingCycle
                      ? `${plan.billingCycle} billing`
                      : "Usage-based billing"
                  );
                }
              }
              features.push(
                plan.capabilityCount > 0
                  ? `${plan.capabilityCount} capabilities`
                  : "All included capabilities"
              );
              return (
                <LivePlanCard
                  key={plan.id}
                  plan={plan}
                  price={price}
                  priceSub={priceSub}
                  features={features}
                  isCurrent={isCurrent}
                  isPending={isPending}
                  isLast={index === plans.length - 1}
                  busy={busyPlanId === plan.id}
                  disabled={
                    action === "current" || !isConnected || busyPlanId !== null
                  }
                  action={action}
                  onSelect={() => void onPlanAction(plan.id, action)}
                />
              );
            })}
          </div>
        )}
      </SettingsCard>

      <SettingsHeader
        title="Credits"
        sub="Prepaid balance, drawn down after included usage runs out"
        action={
          <IconButton
            primary
            onClick={() => setTopUpOpen((open) => !open)}
            disabled={!isConnected || topUpBusy}
          >
            {!topUpOpen && <Plus className="h-3 w-3" aria-hidden="true" />}
            {topUpOpen ? "Cancel" : "Add funds"}
          </IconButton>
        }
      />
      <SettingsCard>
        {wallet.state.status === "loading" || wallet.state.status === "idle" ? (
          <div className="px-5 py-6">
            <div className="h-8 w-32 animate-pulse rounded bg-dark-card motion-reduce:animate-none" />
          </div>
        ) : wallet.state.status === "error" ? (
          <p className="px-5 py-6 text-[12.5px] text-fg-faint">
            {wallet.state.message}
          </p>
        ) : creditsUsd <= 0 ? (
          // Matches the Payment method empty state next to it. A $0.00 set at
          // 28px is a loud way to say nothing.
          <div className="px-5 py-9 text-center">
            <Wallet
              className="mx-auto h-[22px] w-[22px] text-fg-disabled"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-2 text-[13.5px] font-medium text-fg">No credits</p>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] text-fg-faint">
              {included
                ? `Once the ${included.planName ?? "plan"} allowance runs out, usage draws on credits before it is invoiced as overage.`
                : "Credits are drawn on before usage is invoiced as overage."}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 py-4">
            <div>
              <p className="font-mono text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums text-fg">
                ${formatWalletUsd(wallet.state.wallet.balance?.usdMicros)}
              </p>
              <p className="mt-2 text-[12.5px] text-fg-faint">
                {included
                  ? `Drawn on after the ${included.planName ?? "plan"} allowance`
                  : "Drawn on before metered overage"}
              </p>
            </div>
            {overageNote && (
              <p className="text-[12.5px] text-fg-faint">{overageNote}</p>
            )}
          </div>
        )}

        {topUpOpen && (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3.5">
            <span className="font-mono text-[13px] text-fg-faint">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              aria-label="Top-up amount in USD"
              className="h-7 w-24 rounded-[4px] border border-hairline bg-dark-card px-2 font-mono text-[13px] tabular-nums text-fg outline-none focus-visible:ring-1 focus-visible:ring-green-bright/30"
            />
            {["10.00", "25.00", "100.00"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTopUpAmount(preset)}
                className="btn-outline rounded-[4px] px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors"
              >
                ${preset}
              </button>
            ))}
            <IconButton
              primary
              onClick={() => void onAddFunds()}
              disabled={topUpBusy}
            >
              {topUpBusy ? "Starting…" : "Continue"}
            </IconButton>
          </div>
        )}
      </SettingsCard>

      <SettingsHeader
        title="Payment method"
        sub="Card on file for subscription charges and pay-per-use auto-debit"
        action={
          <IconButton
            primary
            onClick={() => void onAddCard()}
            disabled={pmBusy || !isConnected}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {pmBusy ? "Starting…" : "Add card"}
          </IconButton>
        }
      />
      <SettingsCard>
        {accountLoading ? (
          <div className="animate-pulse px-5 py-9">
            <div className="mx-auto h-5 w-40 rounded bg-white/5" />
          </div>
        ) : paymentMethodsError ? (
          <div className="px-5 py-6 text-center">
            <p className="text-[13px] text-fg-muted">
              Could not load payment methods.
            </p>
            <p className="mt-1 font-mono text-[12px] text-fg-faint">
              {paymentMethodsError}
            </p>
            <button
              type="button"
              className="mt-2 text-[12.5px] text-fg-strong underline"
              onClick={() => void reloadAccount()}
            >
              Retry
            </button>
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="px-5 py-9 text-center">
            <Box
              className="mx-auto h-[22px] w-[22px] text-fg-disabled"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-2 text-[13.5px] font-medium text-fg">
              No payment method
            </p>
            <p className="mt-1 text-[12.5px] text-fg-faint">
              Add a card via Stripe Checkout for subscription and usage charges.
              Completing Checkout updates your card on file even if you do not
              return to this page.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-hairline)]">
            {paymentMethods.map((pm) => {
              const isBusy = paymentMethodActionId === pm.id;
              return (
                <li key={pm.id} className="flex items-center gap-3 px-5 py-3.5">
                  <CreditCard
                    className="h-4 w-4 shrink-0 text-fg-faint"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-fg">
                      {(pm.brand || pm.type || "Card").toUpperCase()}
                      {pm.last4 ? ` ···· ${pm.last4}` : ""}
                    </p>
                    <p className="text-[12px] text-fg-faint">
                      {pm.expMonth && pm.expYear
                        ? `Expires ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}`
                        : pm.type}
                      {pm.isDefault ? " · Default" : ""}
                    </p>
                  </div>
                  {!pm.isDefault ? (
                    <button
                      type="button"
                      className="text-[12px] text-green-bright transition-colors hover:text-fg disabled:opacity-50"
                      disabled={paymentMethodActionId !== null}
                      onClick={() => void onSetDefaultPaymentMethod(pm.id)}
                    >
                      {isBusy ? "Saving…" : "Set default"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-fg-faint transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
                    disabled={paymentMethodActionId !== null}
                    onClick={() => void onRemovePaymentMethod(pm.id)}
                    aria-label={`Remove ${(pm.brand || pm.type || "payment method").toLowerCase()} ending ${pm.last4 ?? ""}`}
                    title="Remove payment method"
                  >
                    {isBusy ? (
                      "…"
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>

      <SettingsHeader
        title="Plan history"
        sub="Every plan this account has been on, newest first"
      />
      <SettingsCard>
        {accountLoading ? (
          <div className="animate-pulse p-5">
            <div className="h-4 w-full rounded bg-white/5" />
          </div>
        ) : subscriptionsError ? (
          <div className="px-5 py-6 text-center">
            <p className="text-[13px] text-fg-muted">
              Could not load plan history.
            </p>
            <p className="mt-1 font-mono text-[12px] text-fg-faint">
              {subscriptionsError}
            </p>
            <button
              type="button"
              className="mt-2 text-[12.5px] text-fg-strong underline"
              onClick={() => void reloadAccount()}
            >
              Retry
            </button>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="px-5 py-9 text-center">
            <p className="text-[13.5px] text-fg-muted">
              No subscription history yet.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`grid items-center gap-3 px-[18px] py-3 grid-cols-[1.6fr_0.7fr_0.9fr_0.9fr] ${ST_HEAD_CLASS}`}
            >
              <span>Plan</span>
              <span>Status</span>
              <span>Started</span>
              <span>Ended</span>
            </div>
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="grid items-center gap-3 border-b border-hairline px-[18px] py-3 grid-cols-[1.6fr_0.7fr_0.9fr_0.9fr] last:border-b-0 transition-colors hover:bg-zebra"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-fg">
                    {sub.planName?.trim() || sub.planKey?.trim() || "Plan"}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-fg-faint">
                    {sub.id}
                  </div>
                </div>
                <div
                  className={
                    sub.current
                      ? "text-[12px] font-medium text-green-bright"
                      : "text-[12px] capitalize text-fg-faint"
                  }
                >
                  {formatSubscriptionHistoryStatus(sub)}
                </div>
                <div className="text-[12.5px] text-fg-faint">
                  {formatInvoiceDate(sub.activeFrom ?? undefined)}
                </div>
                <div className="text-[12.5px] text-fg-faint">
                  {sub.current
                    ? "—"
                    : formatInvoiceDate(sub.activeTo ?? undefined)}
                </div>
              </div>
            ))}
          </>
        )}
      </SettingsCard>

      <SettingsHeader
        title="Billing history"
        sub="Stripe invoices and auto top-ups for this account"
      />
      <SettingsCard>
        {accountLoading ? (
          <div className="animate-pulse p-5">
            <div className="h-4 w-full rounded bg-white/5" />
          </div>
        ) : invoicesError ? (
          <div className="px-5 py-6 text-center">
            <p className="text-[13px] text-fg-muted">
              Could not load billing history.
            </p>
            <p className="mt-1 font-mono text-[12px] text-fg-faint">
              {invoicesError}
            </p>
            <button
              type="button"
              className="mt-2 text-[12.5px] text-fg-strong underline"
              onClick={() => void reloadAccount()}
            >
              Retry
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-5 py-9 text-center">
            <p className="text-[13.5px] text-fg-muted">
              No invoices or top-ups yet.
            </p>
          </div>
        ) : (
          <>
            <div className={`${ST_COLS_5} ${ST_HEAD_CLASS}`}>
              <span>Item</span>
              <span>Date</span>
              <span>Amount</span>
              <span>Status</span>
              <span aria-hidden="true" />
            </div>
            {invoices.map((inv) => {
              const isReceiptOnly =
                inv.invoiceType === "auto_topup" ||
                inv.invoiceType === "payment";
              const statusLabel =
                inv.invoiceType === "auto_topup"
                  ? "Top-up"
                  : inv.invoiceType === "payment"
                    ? "Paid"
                    : inv.status;
              return (
                <div
                  key={inv.id}
                  className={`${ST_COLS_5} border-b border-hairline last:border-b-0 transition-colors hover:bg-zebra`}
                >
                  <div className="font-mono text-[12.5px] text-fg">
                    {inv.number?.trim() || inv.id}
                  </div>
                  <div className="text-[12.5px] text-fg-faint">
                    {formatInvoiceDate(inv.issuedAt || inv.periodStart)}
                  </div>
                  <div className="font-mono text-[12.5px] text-fg">
                    {formatInvoiceAmount(inv.totalAmount, inv.currency)}
                  </div>
                  <div className="text-[12px] capitalize text-fg-faint">
                    {statusLabel}
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="text-[12px] text-fg-strong transition-colors hover:text-fg disabled:opacity-50"
                      disabled={invoiceBusyId === inv.id}
                      onClick={() => void onOpenInvoice(inv.id, "hosted")}
                    >
                      {isReceiptOnly ? "Receipt" : "View"}
                    </button>
                    {isReceiptOnly ? null : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[12px] text-fg-strong transition-colors hover:text-fg disabled:opacity-50"
                        disabled={invoiceBusyId === inv.id}
                        onClick={() => void onOpenInvoice(inv.id, "pdf")}
                      >
                        <Download className="h-3 w-3" aria-hidden="true" />
                        PDF
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </SettingsCard>

      <Dialog
        open={cancelDialogOpen}
        onClose={() => {
          if (!lifecycleBusy) setCancelDialogOpen(false);
        }}
        maxWidth="max-w-[420px]"
      >
        <TimingChoicePanel
          title="Cancel subscription"
          description="Choose when access should end. You can restore anytime before then if you pick a future date."
          options={subscription?.timingOptions?.cancel}
          choice={cancelChoice}
          customDate={cancelCustomDate}
          confirmLabel="Confirm cancel"
          busy={lifecycleBusy}
          onChoice={setCancelChoice}
          onCustomDate={setCancelCustomDate}
          onConfirm={() => void onConfirmCancel()}
          onClose={() => setCancelDialogOpen(false)}
        />
      </Dialog>

      <Dialog
        open={changeDialog !== null}
        onClose={() => {
          if (busyPlanId === null) setChangeDialog(null);
        }}
        maxWidth="max-w-[420px]"
      >
        <TimingChoicePanel
          title={
            changeDialog?.conflict
              ? "Replace scheduled plan change?"
              : "Switch to Starter"
          }
          description={
            changeDialog?.conflict
              ? "A plan change is already scheduled. Choosing a start time replaces that schedule with your new plan."
              : "Choose when the switch to Starter should take effect."
          }
          options={
            changeDialog?.conflict?.timingOptions ??
            subscription?.timingOptions?.change
          }
          choice={changeChoice}
          customDate={changeCustomDate}
          confirmLabel="Confirm switch"
          busy={busyPlanId !== null}
          onChoice={setChangeChoice}
          onCustomDate={setChangeCustomDate}
          onConfirm={() => void onConfirmChangeTiming()}
          onClose={() => setChangeDialog(null)}
        />
      </Dialog>
    </div>
  );
}

function LivePlanCard({
  plan,
  price,
  priceSub,
  features,
  isCurrent,
  isPending,
  isLast,
  busy,
  disabled,
  action,
  onSelect,
}: {
  plan: DashboardBillingPlan;
  price: string;
  priceSub: string;
  features: string[];
  isCurrent: boolean;
  isPending: boolean;
  isLast: boolean;
  busy: boolean;
  disabled: boolean;
  action: BillingPlanAction;
  onSelect: () => void;
}) {
  const isHighlighted = isCurrent || isPending;
  return (
    <div
      className={`relative p-[18px] ${
        isLast ? "" : "border-b border-hairline md:border-b-0 md:border-r"
      }`}
      style={
        isHighlighted
          ? {
              background:
                "linear-gradient(180deg, rgba(64, 191, 134, 0.06), transparent)",
            }
          : undefined
      }
    >
      {isHighlighted ? (
        <span
          className="absolute top-0 bottom-0 left-0 w-[2px] bg-green"
          aria-hidden="true"
        />
      ) : null}
      {isCurrent ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-green-bright">
          Current plan
        </p>
      ) : null}
      {isPending ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-amber-300">
          Payment pending
        </p>
      ) : null}
      <p
        className={`text-[16px] font-medium text-fg ${isHighlighted ? "mt-1" : ""}`}
      >
        {plan.name}
      </p>
      <p className="mt-1 text-[13px] text-fg-strong">
        <span className="text-[22px] font-medium tracking-[-0.01em] text-fg">
          {price}
        </span>
        <span className="text-fg-faint">{priceSub}</span>
      </p>
      <ul className="mt-3.5 flex flex-col gap-1.5">
        {features.map((line) => (
          <li
            key={line}
            className="flex items-center gap-1.5 text-[12.5px] text-fg-strong"
          >
            <Check
              className="h-3 w-3 shrink-0 text-green-bright"
              aria-hidden="true"
            />
            {line}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`mt-4 inline-flex h-7 items-center gap-1 rounded-[4px] border px-3 text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
          action === "current"
            ? "border-subtle bg-transparent text-fg-muted"
            : "btn-primary"
        }`}
      >
        {busy
          ? "Working…"
          : billingPlanActionLabel(action, {
              usagePlan: isUsagePlan(plan),
              starterPlan: plan.isStarterDefault === true,
            })}
        {action !== "current" && !busy ? (
          <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
        ) : null}
      </button>
    </div>
  );
}
