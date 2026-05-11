// Types pour les données d'armes
export interface WeaponData {
  id: string;
  code: string;
  label: string;
}

// Marques pour fusils
export const FUSILS = [
  { value: "ARMED", label: "ARMED" },
  { value: "ATA", label: "ATA Arms" },
  { value: "BAIKAL", label: "BAIKAL" },
  { value: "BERETTA", label: "BERETTA" },
  { value: "BROWNING", label: "BROWNING" },
  { value: "CROMATA", label: "CROMATA" },
  { value: "ESCORT", label: "ESCORT" },
  { value: "FABARM", label: "FABARM" },
  { value: "FRANCHI", label: "FRANCHI" },
  { value: "HUGLU", label: "HUGLU" },
  { value: "IDEAL", label: "IDEAL" },
  { value: "AUTRE", label: "Autre" },
];

// Marques pour carabines
export const CARABINES = [
  { value: "BAR", label: "Browning BAR" },
  { value: "BAIKAL", label: "BAIKAL" },
  { value: "BERGARA", label: "BERGARA" },
  { value: "BERETTA", label: "BERETTA" },
  { value: "BROWNING", label: "BROWNING" },
  { value: "AUTRE", label: "Autre" },
];

// Calibres pour grande chasse
export const LARGE_CALIBERS = [
  { value: "243Win", label: ".243 Winchester" },
  { value: "7x57", label: "7x57 Mauser" },
  { value: "7x64", label: "7x64 Brenneke" },
  { value: "308Win", label: ".308 Winchester" },
  { value: "AUTRE-CALIBRE", label: "Autre calibre" },
];

// Calibres pour petite chasse
export const SMALL_CALIBERS = [
  { value: "12Gauge", label: "Calibre 12" },
  { value: "16Gauge", label: "Calibre 16" },
  { value: "20Gauge", label: "Calibre 20" },
  { value: "AUTRE-CALIBRE", label: "Autre calibre" },
];
