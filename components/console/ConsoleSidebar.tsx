"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisVertical } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LivepeerLockup } from "@/components/design-system/LivepeerLogo";
import { PORTAL_NAV_ITEMS } from "@/lib/constants";
import { AUTH_SIGNIN_HREF, AUTH_SIGNUP_HREF } from "@/lib/console/auth-login";
import { useAuth, type ConsoleUser } from "@/components/console/AuthContext";
import Drawer from "@/components/design-system/Drawer";
import NavLink from "@/components/console/NavLink";
import { THEME_OPTIONS, useTheme } from "@/components/console/ThemeContext";

type PortalNavItem = {
  href: string;
  label: string;
  zone: "network" | "organization";
};

const ADMIN_NAV_ITEM: PortalNavItem = {
  label: "Admin",
  href: "/admin",
  zone: "organization",
};

function getNavActive(itemHref: string, pathname: string): boolean {
  if (itemHref === "/home") return pathname === "/home";
  if (itemHref.includes("?")) {
    const path = itemHref.split("?")[0];
    return pathname.startsWith(path);
  }
  return pathname.startsWith(itemHref);
}

function MobileMenuIcon({ open = false }: { open?: boolean }) {
  return (
    <span aria-hidden="true" className="relative block h-4 w-8">
      <span
        className="absolute right-0.5 h-1 w-[30px] transition-[top,transform] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
        style={{
          top: open ? 6 : 2,
          transform: open ? "rotate(135deg)" : "rotate(0deg)",
          transformOrigin: "19px 50%",
        }}
      >
        <span
          className="block h-full w-full origin-right bg-current transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          style={{ transform: open ? "scaleX(0.733333)" : "scaleX(1)" }}
        />
      </span>
      <span
        className="absolute right-0.5 h-1 w-[22px] origin-center bg-current transition-[top,transform] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
        style={{
          top: open ? 6 : 10,
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
        }}
      />
    </span>
  );
}

function MobileMenuButton({
  open,
  label,
  controls,
  onClick,
}: {
  open: boolean;
  label: string;
  controls?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className="-mr-2 flex h-10 w-10 items-center justify-center rounded-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <MobileMenuIcon open={open} />
    </button>
  );
}

function MobileBrandLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-10 items-center rounded-sm p-1.5 text-foreground"
      onClick={onNavigate}
    >
      <LivepeerLockup className="h-4 w-auto" aria-hidden="true" />
    </Link>
  );
}

function UserAvatar({
  user,
  className,
}: {
  user: ConsoleUser;
  className: string;
}) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${className} object-cover`}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`${className} grid place-items-center bg-green text-[10.5px] font-semibold tracking-[0.02em] text-white`}
      aria-hidden="true"
    >
      {user.initials}
    </span>
  );
}

function UserFooter({
  user,
  onSignOut,
}: {
  user: ConsoleUser | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { preference, setPreference, isLoading: themeLoading } = useTheme();
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

  if (!user) return null;

  const signOut = () => {
    setOpen(false);
    onSignOut();
  };

  return (
    <>
      <motion.div
        layout="position"
        className={`group relative shrink-0 border-t border-border transition-colors ${
          open ? "bg-foreground/3" : "hover:bg-foreground/3"
        }`}
        transition={transition}
      >
        <button
          type="button"
          aria-label="Account settings"
          aria-expanded={open}
          aria-controls="account-settings"
          onClick={() => setOpen((next) => !next)}
          className="flex w-full min-w-0 items-center gap-2 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <UserAvatar user={user} className="h-7 w-7 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 truncate text-ui-caption text-muted-foreground">
            {user.email}
          </span>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={transition}
            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden="true"
          >
            <EllipsisVertical className="h-4 w-4" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id="account-settings"
              key="account-settings"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={transition}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: reduceMotion ? 0 : -4 }}
                animate={{ y: 0 }}
                exit={{ y: reduceMotion ? 0 : -4 }}
                transition={transition}
                className="px-3 pb-5"
              >
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div
                    role="group"
                    aria-label="Appearance"
                    className="inline-flex rounded-full p-0.5"
                  >
                    {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${label} appearance`}
                        aria-pressed={preference === value}
                        title={label}
                        disabled={themeLoading}
                        onClick={() => setPreference(value)}
                        className={`inline-flex size-7 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${preference === value ? "bg-foreground/3 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    className="text-right text-ui-caption text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

function SidebarBrand({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center px-3">
      <Link
        href={href}
        aria-label={label}
        className="inline-flex h-10 min-w-0 items-center rounded-sm p-1.5"
        onClick={onNavigate}
      >
        <LivepeerLockup
          className="h-4 w-auto text-foreground"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}

function SidebarNav({
  items,
  label,
  onNavigate,
}: {
  items: readonly PortalNavItem[];
  label: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="px-3 pb-2">
      <ul className="flex flex-col items-start gap-1">
        {items.map((item) => (
          <li key={item.href} className="flex w-auto items-center gap-1.5">
            <NavLink
              href={item.href}
              label={item.label}
              active={getNavActive(item.href, pathname)}
              onNavigate={onNavigate}
            />
            {item.href === "/home" && (
              <span className="rounded-full border border-hairline bg-background px-2 py-1 text-[10px] leading-none text-muted-foreground">
                early access
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SignedOutSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const publicItems = PORTAL_NAV_ITEMS.filter((i) => i.zone === "network");

  return (
    <div className="flex h-full flex-col bg-muted">
      <SidebarBrand
        href="/"
        label="Livepeer Early Access - explore apps"
        onNavigate={onNavigate}
      />
      <SidebarNav
        items={publicItems}
        label="Public navigation"
        onNavigate={onNavigate}
      />

      <div className="flex-1" />

      <div className="shrink-0 px-3 pb-2">
        <div className="relative overflow-hidden rounded-sm border border-border bg-card pt-[14px] pr-[14px] pb-[12px] pl-[14px]">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 80% at 100% 0%, var(--color-green-subtle), transparent 60%)",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <p className="mb-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-green-bright">
              Free tier
            </p>
            <p className="mb-1.5 text-[14.5px] font-semibold leading-[1.25] text-foreground">
              5 demo calls
              <br />
              per app
            </p>
            <p className="mb-2.5 text-ui-caption text-muted-foreground">
              No credit card. Spin up in 30 seconds with an API key.
            </p>
            <div className="flex flex-col gap-1">
              <a
                href={AUTH_SIGNUP_HREF}
                onClick={() => onNavigate?.()}
                className="btn-primary flex h-7 w-full items-center justify-center rounded-sm px-2.5 text-[12.5px] font-medium transition-colors"
              >
                Get an API key
              </a>
              <a
                href={AUTH_SIGNIN_HREF}
                onClick={() => onNavigate?.()}
                className="flex h-[26px] w-full items-center justify-center rounded-sm text-ui-caption font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Sign in
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { isConnected, isLoading, user, disconnect } = useAuth();
  const primaryItems: PortalNavItem[] = PORTAL_NAV_ITEMS.filter(
    (i) => i.zone !== "network"
  );
  if (user?.isAdmin) primaryItems.push(ADMIN_NAV_ITEM);

  if (!isLoading && !isConnected) {
    return <SignedOutSidebarContent onNavigate={onNavigate} />;
  }

  return (
    <div className="flex h-full flex-col bg-muted">
      <SidebarBrand
        href="/home"
        label="Livepeer Early Access"
        onNavigate={onNavigate}
      />
      <SidebarNav
        items={primaryItems}
        label="Primary"
        onNavigate={onNavigate}
      />

      <div className="flex-1" />

      <UserFooter user={user} onSignOut={disconnect} />
    </div>
  );
}

function MobileSidebarContent({ onNavigate }: { onNavigate: () => void }) {
  const { isConnected, isLoading, user, disconnect } = useAuth();
  const pathname = usePathname();
  const isSignedOut = !isLoading && !isConnected;
  const items: PortalNavItem[] = PORTAL_NAV_ITEMS.filter((i) =>
    isSignedOut ? i.zone === "network" : i.zone !== "network"
  );
  if (!isSignedOut && user?.isAdmin) items.push(ADMIN_NAV_ITEM);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-6">
      <nav
        aria-label={isSignedOut ? "Public navigation" : "Primary"}
        className="flex flex-col pt-6"
      >
        <ul className="flex flex-col items-start gap-1">
          {items.map((item) => (
            <li key={item.href} className="w-auto">
              <NavLink
                href={item.href}
                label={item.label}
                active={getNavActive(item.href, pathname)}
                onNavigate={onNavigate}
                variant="mobile"
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-h-8 flex-1" />

      {isSignedOut ? (
        <div className="-mx-4 border-t border-border px-4 py-4 sm:-mx-6 sm:px-6">
          <div className="flex flex-col items-start gap-1">
            <a
              href={AUTH_SIGNUP_HREF}
              onClick={onNavigate}
              className="inline-flex w-auto items-center rounded-sm px-1 py-1.5 text-4xl font-light leading-none tracking-tight text-foreground transition-colors hover:bg-foreground/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Get an API key
            </a>
            <a
              href={AUTH_SIGNIN_HREF}
              onClick={onNavigate}
              className="inline-flex w-auto items-center rounded-sm px-1 py-1.5 text-4xl font-light leading-none tracking-tight text-muted-foreground transition-colors hover:bg-foreground/3 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Sign in
            </a>
          </div>
        </div>
      ) : (
        <div className="-mx-4 sm:-mx-6">
          <UserFooter user={user} onSignOut={disconnect} />
        </div>
      )}
    </div>
  );
}

function MobileHeader({
  drawerOpen,
  onOpen,
}: {
  drawerOpen: boolean;
  onOpen: () => void;
}) {
  const { isConnected, isLoading } = useAuth();
  const homeHref = !isLoading && !isConnected ? "/" : "/home";

  return (
    <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-background/70 bg-background/10 px-3 backdrop-blur-sm md:hidden">
      <MobileBrandLink href={homeHref} label="Livepeer Early Access" />
      <MobileMenuButton
        open={drawerOpen}
        label="Open navigation"
        controls="console-sidebar-drawer"
        onClick={onOpen}
      />
    </div>
  );
}

function MobileNavigationDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { isConnected, isLoading } = useAuth();
  const homeHref = !isLoading && !isConnected ? "/" : "/home";

  return (
    <Drawer
      id="console-sidebar-drawer"
      open={open}
      onClose={onClose}
      ariaLabel="Navigation"
      side="top"
      backdropClassName="bg-transparent backdrop-blur-none transition-none"
      panelClassName="bg-background text-foreground"
    >
      <div className="flex h-[100dvh] flex-col bg-background">
        <div className="flex h-16 shrink-0 items-center justify-between px-3">
          <MobileBrandLink
            href={homeHref}
            label="Livepeer Early Access"
            onNavigate={onClose}
          />
          <MobileMenuButton
            open
            label="Close navigation"
            controls="console-sidebar-drawer"
            onClick={onClose}
          />
        </div>
        <MobileSidebarContent onNavigate={onClose} />
      </div>
    </Drawer>
  );
}

export default function ConsoleSidebar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 z-30 hidden h-screen w-[256px] shrink-0 flex-col bg-muted md:flex">
        <SidebarContent />
      </aside>

      <MobileHeader
        drawerOpen={drawerOpen}
        onOpen={() => setDrawerOpen(true)}
      />

      <MobileNavigationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
