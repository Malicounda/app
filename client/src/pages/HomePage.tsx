import { Button } from "@/components/ui/button";
import { DOMAIN_CONFIGS, resolveDomainConfig } from "@/lib/domainConfig";
import { ICONS } from "@/lib/domainIcons";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type ThemeConfig = {
  domains?: Record<string, { from?: string; to?: string; icon?: string; logoUrl?: string }>;
};

// ICONS est importé depuis @/lib/domainIcons (source unique partagée avec les pages de connexion)

const slides = [
  {
    title: "Chasse réglementée",
    subtitle: "Digitalisation des permis et zones de chasse.",
    bg: "bg-green-700",
  },
  {
    title: "Préserver nos forêts",
    subtitle: "Un avenir durable grâce à une gestion intelligente.",
    bg: "bg-emerald-800",
  },
  {
    title: "Reboisement massif",
    subtitle: "Suivi et traçabilité des campagnes de reboisement.",
    bg: "bg-lime-700",
  },
];

const modules = DOMAIN_CONFIGS.map((d) => ({
  title: d.key === 'chasse' ? 'Chasse' : d.key === 'produits-forestiers' ? 'Produits Forestiers' : d.key === 'reboisement' ? 'Reboisement et Pépinières' : 'Alerte',
  description: d.key === 'chasse' ? 'Demande de permis et zones de chasse' : d.key === 'produits-forestiers' ? 'Circulation des produits forestiers' : d.key === 'reboisement' ? 'Demande et suivi des plants' : 'Signalement en temps réel des infractions et des incidents sur le terrain.',
  icon: d.icon,
  color: `${d.color} ${d.colorTo}`,
  hoverColor: d.key === 'chasse' ? 'hover:from-green-700 hover:to-green-800' : d.key === 'produits-forestiers' ? 'hover:from-teal-600 hover:to-teal-700' : d.key === 'reboisement' ? 'hover:from-green-600 hover:to-green-700' : 'hover:from-amber-600 hover:to-orange-600',
  path: d.loginPath,
}));

type Domaine = {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [showModules, setShowModules] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('showModules') === '1';
    } catch { return false; }
  });

  const [themeCfg, setThemeCfg] = useState<ThemeConfig | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('theme:superadmin');
      setThemeCfg(raw ? JSON.parse(raw) : null);
    } catch {
      setThemeCfg(null);
    }
  }, []);

  useEffect(() => {
    const onThemeUpdated = () => {
      try {
        const raw = localStorage.getItem('theme:superadmin');
        setThemeCfg(raw ? JSON.parse(raw) : null);
      } catch {
        setThemeCfg(null);
      }
    };
    window.addEventListener('theme:superadmin:updated', onThemeUpdated);
    return () => window.removeEventListener('theme:superadmin:updated', onThemeUpdated);
  }, []);

  const { data: activeDomaines } = useQuery({
    queryKey: ["/api/domaines/public/active"],
    queryFn: () => apiRequest<Domaine[]>({ url: "/api/domaines/public/active", method: "GET" }),
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const setDomainForModule = (title: string) => {
    const t = String(title || '').toLowerCase();
    try {
      if (t.includes('chasse')) {
        localStorage.setItem('domain', 'CHASSE');
      } else if (t.includes('reboisement')) {
        localStorage.setItem('domain', 'REBOISEMENT');
      }
    } catch {}
  };

  const resolveModuleMeta = (d: Domaine) => {
    const domainKey = String(d?.nomDomaine || '').toUpperCase();
    const t = themeCfg?.domains?.[domainKey];
    const iconName = String(t?.icon || '').trim();
    const icon = (iconName && ICONS[iconName]) ? ICONS[iconName] : undefined;
    const logoUrl = String(t?.logoUrl || '').trim() || undefined;
    const from = String(t?.from || '').trim() || undefined;
    const to = String(t?.to || '').trim() || undefined;
    const themedStyle = from && to ? { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` } : undefined;

    const cfg = resolveDomainConfig(d.nomDomaine, d.codeSlug);

    if (cfg) {
      const hoverMap: Record<string,string> = { chasse: 'hover:from-green-700 hover:to-green-800', 'produits-forestiers': 'hover:from-teal-600 hover:to-teal-700', reboisement: 'hover:from-green-600 hover:to-green-700', alerte: 'hover:from-amber-600 hover:to-orange-600' };
      return {
        title: d.nomDomaine,
        description: d.description || (cfg.key === 'chasse' ? "Demande de permis et zones de chasse" : cfg.key === 'produits-forestiers' ? "Circulation des produits forestiers" : cfg.key === 'reboisement' ? "Demande et suivi des plants" : "Signalement en temps réel des infractions et des incidents sur le terrain."),
        icon: icon || cfg.icon,
        color: `${cfg.color} ${cfg.colorTo}`,
        hoverColor: hoverMap[cfg.key] || '',
        path: cfg.loginPath,
        domainValue: d.nomDomaine,
        themedStyle,
        logoUrl,
      };
    }

    return {
      title: d.nomDomaine,
      description: d.description || "",
      icon: icon || DOMAIN_CONFIGS[0].icon,
      color: "from-slate-600 to-slate-700",
      hoverColor: "hover:from-slate-700 hover:to-slate-800",
      path: "/",
      domainValue: d.nomDomaine,
      themedStyle,
      logoUrl,
    };
  };

  const modulesToDisplay = Array.isArray(activeDomaines) && activeDomaines.length > 0
    ? activeDomaines.map(resolveModuleMeta)
    : modules;

  const nextSlide = () => {
    setIndex((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  useEffect(() => {
    document.title = "Accueil | SCoDiPP - Systeme de Control";
    // Pendant l'étape de choix (showModules=true), on désactive l'auto-défilement
    if (showModules) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModules]);

  return (
    <div className="min-h-[100svh] flex flex-col safe-area-x safe-area-y overflow-y-auto overflow-x-hidden">
      <div className={`relative flex-1 flex items-center justify-center text-white overflow-hidden ${showModules ? 'bg-green-700' : slides[index].bg}`}>
        {!showModules && (
          <AnimatePresence initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.8 }}
              className={`absolute inset-0 ${slides[index].bg}`}
            />
          </AnimatePresence>
        )}

        {!showModules ? (
          <div className="relative z-10 text-center space-y-4 px-4 sm:px-6 py-4 sm:py-6 max-w-6xl mx-auto w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-2 leading-tight">
              {slides[index].title}
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-4 leading-relaxed px-2">
              {slides[index].subtitle}
            </p>
            <Button
              size="lg"
              onClick={() => setShowModules(true)}
              className="px-6 sm:px-8 md:px-10 py-4 sm:py-5 md:py-7 text-base sm:text-lg md:text-xl font-semibold bg-white text-gray-900 hover:bg-gray-100 shadow-2xl hover:shadow-3xl transform hover:scale-105 transition-all duration-300 mt-6"
            >
              Cliquer pour vous connecter
            </Button>
          </div>
        ) : (
          <div className="relative z-10 mt-2 sm:mt-4 w-full">
            <div className="pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-3 sm:gap-6 gap-y-4 sm:gap-y-6 items-stretch max-w-5xl w-full mx-auto px-2 sm:px-4 md:px-6 pb-6">
                {modulesToDisplay.map((module: any, idx: number) => {
                  const Icon = module.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (module.domainValue) {
                          try { localStorage.setItem('domain', String(module.domainValue).toUpperCase()); } catch {}
                        } else {
                          setDomainForModule(module.title);
                        }
                        setLocation(module.path);
                      }}
                      className={`bg-gradient-to-br ${module.color} ${module.hoverColor} text-white rounded-2xl p-3 sm:p-6 md:p-7 lg:p-8 shadow-2xl text-left transition-all duration-300 hover:shadow-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 h-full min-h-[140px] sm:min-h-[180px] flex flex-col touch-manipulation active:scale-[0.99]`}
                      style={module.themedStyle}
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 sm:p-4">
                          {module.logoUrl ? (
                            <img
                              src={module.logoUrl}
                              alt={module.title}
                              className="w-[clamp(1.75rem,6vw,2.75rem)] h-[clamp(1.75rem,6vw,2.75rem)] object-contain"
                            />
                          ) : (
                            <Icon className="w-[clamp(1.75rem,6vw,2.75rem)] h-[clamp(1.75rem,6vw,2.75rem)]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold mb-2 text-[clamp(1.1rem,2.5vw,1.5rem)]">{module.title}</h3>
                          <p className="text-white/90 text-[clamp(0.95rem,2vw,1.125rem)] leading-snug">{module.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => setShowModules(false)}
              className="mt-6 text-white border border-white hover:bg-white/20"
            >
              Retour
            </Button>
          </div>
        )}

        {!showModules && (
          <>
            <button
              onClick={prevSlide}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full z-20"
              aria-label="Diapositive précédente"
            >
              <ChevronLeft size={32} />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full z-20"
              aria-label="Diapositive suivante"
            >
              <ChevronRight size={32} />
            </button>
          </>
        )}
      </div>

      <footer className="bg-gray-100 border-t border-gray-200/80 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 text-center text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} SCoDiPP - République du Sénégal</p>
          <p className="mt-2 opacity-80">
            Ministère de l'Environnement et de la Transition Écologique
          </p>
          <p className="opacity-80">
            Direction des Eaux et Forêts Chasse et Conservation des Sols (DFCCS)
          </p>
          <p className="opacity-80 mt-2">
            © 2022 - Abdoulaye SENE · Ingénieur des travaux des Eaux et Forêts · Chef de division Gestion de la Faune - IREF THIÈS
          </p>
        </div>
      </footer>
    </div>
  );
}
