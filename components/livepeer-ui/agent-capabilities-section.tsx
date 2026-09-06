import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AgentCapabilitiesSection({
  capabilities,
  content,
  showCta = true,
  badgesFirst = false,
  className,
  badgesClassName,
  badgeClassName,
  headingClassName,
}: {
  capabilities: string[];
  content: { heading: string; cta: { label: string; href: string } };
  showCta?: boolean;
  badgesFirst?: boolean;
  className?: string;
  badgesClassName?: string;
  badgeClassName?: string;
  headingClassName?: string;
}) {
  return (
    <section
      className={cn(
        "bg-background px-4 py-24 sm:px-6 sm:py-32 lg:px-10",
        className
      )}
    >
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center text-center">
        <h2
          className={cn(
            "max-w-3xl text-display-sm text-balance sm:text-display-md",
            badgesFirst && "order-2 mt-10",
            headingClassName
          )}
        >
          {content.heading}
        </h2>
        <div
          className={cn(
            badgesFirst
              ? "order-1 flex max-w-5xl flex-wrap justify-center gap-2"
              : "mt-10 flex max-w-5xl flex-wrap justify-center gap-2",
            badgesClassName
          )}
        >
          {capabilities.map((capability) => (
            <Badge
              key={capability}
              variant="secondary"
              className={cn("rounded-sm px-3 py-2 font-normal", badgeClassName)}
            >
              {capability}
            </Badge>
          ))}
        </div>
        {showCta && (
          <Button
            size="lg"
            variant="secondary"
            nativeButton={false}
            render={<Link href={content.cta.href} />}
            className={
              badgesFirst
                ? "order-3 mt-10 h-16 rounded-sm px-6"
                : "mt-10 h-16 rounded-sm px-6"
            }
          >
            {content.cta.label}
            <span className="font-sans" aria-hidden="true">
              →
            </span>
          </Button>
        )}
      </div>
    </section>
  );
}
