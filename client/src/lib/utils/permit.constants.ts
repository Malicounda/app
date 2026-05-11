export const WEAPON_TYPES = [
  { value: "fusil", label: "Fusil" },
  { value: "carabine", label: "Carabine" },
  { value: "arbalete", label: "Arbalète" },
  { value: "arc", label: "Arc" },
  { value: "lance-pierre", label: "Lance-pierre" },
] as const;

export const WEAPON_BRANDS = {
  fusil: [
    { value: "BERETTA", label: "Beretta" },
    { value: "BROWNING", label: "Browning" },
    { value: "BENELLI", label: "Benelli" },
    { value: "AUTRE", label: "Autre (précisez)" },
  ],
  carabine: [
    { value: "SAKO", label: "Sako" },
    { value: "TIKKA", label: "Tikka" },
    { value: "AUTRE", label: "Autre (précisez)" },
  ],
} as const;

export const WEAPON_CALIBERS = {
  fusil: [
    { value: "12-70", label: "12/70" },
    { value: "16-70", label: "16/70" },
    { value: "AUTRE-CALIBRE", label: "Autre calibre" },
  ],
  carabine: [
    { value: "308-WIN", label: ".308 Win" },
    { value: "30-06", label: ".30-06" },
    { value: "AUTRE-CALIBRE", label: "Autre calibre" },
  ],
} as const;

export const HUNTER_CATEGORIES = [
  { value: "resident", label: "Résident" },
  { value: "coutumier", label: "Coutumier" },
  { value: "touristique", label: "Touristique" },
] as const;

export const PERMIT_DURATIONS = [
  { value: "1-week", label: "1 semaine" },
  { value: "2-weeks", label: "2 semaines" },
  { value: "1-month", label: "1 mois" },
] as const;
