import { Bell, MessageSquare, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "alerts" | "messages";

const VARIANTS: Record<
  Variant,
  { gradient: string; Icon: LucideIcon; title: string; subtitle: string }
> = {
  alerts: {
    gradient: "bg-gradient-to-br from-[#6b1010] via-[#b91c1c] to-[#ef4444]",
    Icon: Bell,
    title: "ALERTES",
    subtitle: "Signaler ou suivre vos alertes",
  },
  messages: {
    gradient: "bg-gradient-to-br from-[#0d3a1e] via-[#166534] to-[#22c55e]",
    Icon: MessageSquare,
    title: "MESSAGES",
    subtitle: "Messagerie SMS interne",
  },
};

type Props = {
  variant: Variant;
  onClick: () => void;
  badge?: number;
  size?: "default" | "compact";
  /** Surcharge optionnelle (ex. page superviseur) sans changer le variant. */
  title?: string;
  subtitle?: string;
  className?: string;
};

export default function AlerteDomainActionCard({
  variant,
  onClick,
  badge,
  size = "default",
  title: titleOverride,
  subtitle: subtitleOverride,
  className,
}: Props) {
  const { gradient, Icon, title: defaultTitle, subtitle: defaultSubtitle } =
    VARIANTS[variant];
  const title = titleOverride ?? defaultTitle;
  const subtitle = subtitleOverride ?? defaultSubtitle;
  const compact = size === "compact";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full text-center shadow-md transition-transform active:scale-[0.97]",
        compact ? "rounded-[18px] p-3.5" : "rounded-[24px] p-5",
        gradient,
        className
      )}
    >
      {badge != null && badge > 0 ? (
        <span
          className={cn(
            "absolute z-10 flex items-center justify-center rounded-full bg-white font-bold text-red-600 shadow-sm",
            compact
              ? "top-2 right-2 h-[18px] min-w-[18px] px-1 text-[9px]"
              : "top-3 right-3 h-5 min-w-[20px] px-1.5 text-[10px]"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <div
        className={cn(
          "mx-auto flex items-center justify-center rounded-full bg-white/25 backdrop-blur-sm",
          compact ? "mb-2 h-12 w-12" : "mb-4 h-[72px] w-[72px]"
        )}
      >
        <Icon className={cn("text-white", compact ? "h-6 w-6" : "h-9 w-9")} strokeWidth={2} />
      </div>
      <p
        className={cn(
          "font-black uppercase tracking-wide text-white",
          compact ? "text-[11px]" : "text-[13px]"
        )}
      >
        {title}
      </p>
      <p
        className={cn(
          "font-medium leading-snug text-white/90 line-clamp-2",
          compact ? "mt-1 text-[8px]" : "mt-1.5 text-[9px]"
        )}
      >
        {subtitle}
      </p>
    </button>
  );
}
