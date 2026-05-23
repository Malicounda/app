import { cn } from "@/lib/utils";
import { User, Users } from "lucide-react";

type ContactAvatarProps = {
  size?: "sm" | "md" | "lg";
  unread?: boolean;
  variant?: "list" | "header" | "search";
  isGroup?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: { wrap: "h-9 w-9", icon: "h-4 w-4" },
  md: { wrap: "h-10 w-10", icon: "h-5 w-5" },
  lg: { wrap: "h-12 w-12", icon: "h-6 w-6" },
};

/** Avatar contact messagerie (silhouette utilisateur, style domaine Alerte). */
export function ContactAvatar({
  size = "lg",
  unread = false,
  variant = "list",
  isGroup = false,
  className,
}: ContactAvatarProps) {
  const s = sizeClasses[size];
  const Icon = isGroup ? Users : User;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        s.wrap,
        variant === "list" && (unread ? "bg-green-600" : "bg-slate-400"),
        variant === "header" && "bg-white/25",
        variant === "search" && "bg-green-600",
        className
      )}
      aria-hidden
    >
      <Icon className={cn(s.icon, "text-white/95")} strokeWidth={2} />
    </div>
  );
}

/** Icône modale « Agent introuvable » — même style que l’avatar messagerie. */
export function AgentNotFoundAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-16 w-16 items-center justify-center rounded-full bg-[#114b26] shadow-inner",
        className
      )}
      aria-hidden
    >
      <User className="h-8 w-8 text-emerald-200/95" strokeWidth={2} />
    </div>
  );
}
