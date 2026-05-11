import React from "react";

export type AlertNature = "braconnage" | "trafic-bois" | "feux_de_brousse" | "autre";

interface IconProps {
  size?: number;
  dimmed?: boolean;
  className?: string;
  title?: string;
}

export const WoodTrafficIcon: React.FC<IconProps> = ({ size = 24, dimmed = false, className = "", title = "Trafic de bois" }) => {
  const borderColor = dimmed ? "#9CA3AF" : "#8B5A2B"; // gris vs marron
  const filter = dimmed ? "grayscale(1) opacity(0.85)" : "none";
  const ring = (
    <circle cx="16" cy="16" r="14" fill="none" stroke={borderColor} strokeWidth="4" />
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      {ring}
      <g transform="translate(0,0)" style={{ filter }}>
        {/* Icône bûches (repris de MapComponent) */}
        {/**
         * Center the logs inside the 32x32 icon.
         * Original logs coordinates roughly span x:[12..68], y:[12..44] with center at (40,28).
         * We move to the icon center (16,16), scale, then translate by the negative original center.
         */}
        <g transform="translate(16,16) scale(0.28) translate(-40,-28)">
          <defs>
            <linearGradient id="woodGradIcon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c5b3e" />
              <stop offset="100%" stopColor="#5a3f2a" />
            </linearGradient>
          </defs>
          {/* Bûche 1 (bas) */}
          <rect x="12" y="32" width="52" height="12" rx="6" fill="url(#woodGradIcon)"/>
          <circle cx="12" cy="38" r="6" fill="#f4d7a3" stroke="#7c5b3e" strokeWidth="2"/>
          <circle cx="64" cy="38" r="6" fill="#f4d7a3" stroke="#7c5b3e" strokeWidth="2"/>
          <circle cx="12" cy="38" r="4" fill="none" stroke="#caa873" strokeWidth="1"/>
          <circle cx="64" cy="38" r="4" fill="none" stroke="#caa873" strokeWidth="1"/>
          {/* Bûche 2 (milieu, décalée) */}
          <rect x="16" y="22" width="52" height="12" rx="6" fill="url(#woodGradIcon)"/>
          <circle cx="16" cy="28" r="6" fill="#f4d7a3" stroke="#7c5b3e" strokeWidth="2"/>
          <circle cx="68" cy="28" r="6" fill="#f4d7a3" stroke="#7c5b3e" strokeWidth="2"/>
          <circle cx="16" cy="28" r="4" fill="none" stroke="#caa873" strokeWidth="1"/>
          <circle cx="68" cy="28" r="4" fill="none" stroke="#caa873" strokeWidth="1"/>
          {/* Bûche 3 (haut, courte) */}
          <rect x="20" y="12" width="44" height="10" rx="5" fill="url(#woodGradIcon)"/>
          <circle cx="20" cy="17" r="5" fill="#f4d7a3" stroke="#7c5b3e" strokeWidth="2"/>
          <circle cx="64" cy="17" r="5" fill="#f4d7a3" stroke="#7c5b3e" strokeWidth="2"/>
          <circle cx="20" cy="17" r="3.5" fill="none" stroke="#caa873" strokeWidth="1"/>
          <circle cx="64" cy="17" r="3.5" fill="none" stroke="#caa873" strokeWidth="1"/>
        </g>
      </g>
    </svg>
  );
};

export const PoachingIcon: React.FC<IconProps> = ({ size = 24, dimmed = false, className = "", title = "Braconnage" }) => {
  const borderColor = dimmed ? "#9CA3AF" : "#FF1F3D"; // gris vs rouge
  const filter = dimmed ? "grayscale(1) opacity(0.85)" : "none";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      <title>{title}</title>
      <circle cx="32" cy="32" r="28" fill="none" stroke={borderColor} strokeWidth="5" />
      <g style={{ filter }}>
        {/* viseur + cervidé (repris de MapComponent) */}
        <defs>
          <linearGradient id="sightGradIcon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff6b6b" />
            <stop offset="100%" stopColor="#FF1F3D" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="22" fill="none" stroke="url(#sightGradIcon)" strokeWidth="5" />
        <line x1="32" y1="8" x2="32" y2="18" stroke="#FF1F3D" strokeWidth="4" strokeLinecap="round"/>
        <line x1="8" y1="32" x2="18" y2="32" stroke="#FF1F3D" strokeWidth="4" strokeLinecap="round"/>
        <line x1="46" y1="32" x2="56" y2="32" stroke="#FF1F3D" strokeWidth="4" strokeLinecap="round"/>
        <line x1="32" y1="46" x2="32" y2="56" stroke="#FF1F3D" strokeWidth="4" strokeLinecap="round"/>
        <g transform="translate(0,2)">
          <path d="M28 42 C28 36, 36 36, 36 42 Q32 45 28 42 Z" fill="#8b5e34"/>
          <path d="M24 30 C22 26, 18 24, 18 22 C21 22, 25 24, 27 28" fill="none" stroke="#8b5e34" strokeWidth="3" strokeLinecap="round"/>
          <path d="M40 30 C42 26, 46 24, 46 22 C43 22, 39 24, 37 28" fill="none" stroke="#8b5e34" strokeWidth="3" strokeLinecap="round"/>
          <circle cx="30" cy="38" r="1.6" fill="#1f2937"/>
          <circle cx="34" cy="38" r="1.6" fill="#1f2937"/>
        </g>
      </g>
    </svg>
  );
};

export const FireIcon: React.FC<IconProps> = ({ size = 24, dimmed = false, className = "", title = "Feux de brousse" }) => {
  const borderColor = dimmed ? "#9CA3AF" : "#FB923C"; // gris vs orange
  const flame = dimmed ? "#9CA3AF" : "#FB923C";
  const inner = dimmed ? "#D1D5DB" : "#FED7AA";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} className={className}>
      <title>{title}</title>
      <circle cx="16" cy="16" r="14" fill="none" stroke={borderColor} strokeWidth="4" />
      <g transform="translate(4,4)">
        <svg viewBox="0 0 24 24" width="20" height="20" x="4" y="4" aria-hidden="true">
          <path d="M12 2 C12 2, 16 8, 16 11 C16 13.761 13.761 16 11 16 C8.239 16 6 13.761 6 11 C6 8 12 2 12 2 Z" fill={flame}></path>
          <ellipse cx="11" cy="12.2" rx="2.8" ry="2.2" fill={inner}></ellipse>
        </svg>
      </g>
    </svg>
  );
};

export const NatureIcon: React.FC<{ nature?: AlertNature | null; size?: number; dimmed?: boolean; className?: string }>
  = ({ nature, size = 20, dimmed = false, className = "" }) => {
  const n = (nature || "").toLowerCase();
  if (n.includes("bois") || n.includes("trafic")) {
    return <WoodTrafficIcon size={size} dimmed={dimmed} className={className} />;
  }
  if (n.includes("braconn")) {
    return <PoachingIcon size={size} dimmed={dimmed} className={className} />;
  }
  if (n.includes("feu") || n.includes("brousse") || n.includes("incendi")) {
    return <FireIcon size={size} dimmed={dimmed} className={className} />;
  }
  return null;
};
