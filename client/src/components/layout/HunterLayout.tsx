import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import {
    Bell,
    Search,
    User
} from 'lucide-react';
import React from 'react';

interface HunterLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showToolbar?: boolean;
  showNotifications?: boolean;
}

const Header = ({
  user,
  title = "Mon Espace Chasseur",
  subtitle = "Gérez vos permis et documents en un coup d'œil",
  showNotifications = true
}: {
  user: any,
  title?: string,
  subtitle?: string,
  showNotifications?: boolean
}) => (
  <div className="flex items-center justify-between">
    <div>
      <div className="text-2xl font-semibold">{title}</div>
      <div className="text-slate-500 text-sm">{subtitle}</div>
    </div>
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-200 to-emerald-300 flex items-center justify-center border border-emerald-400">
          <User className="w-4 h-4" />
        </div>
        <div className="text-sm">
          <div className="font-medium leading-none">
            {user?.hunter?.firstName && user?.hunter?.lastName
              ? `${user.hunter.firstName} ${user.hunter.lastName}`
              : user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : 'Chasseur'
            }
          </div>
          <div className="text-slate-500 text-xs">Chasseur</div>
        </div>
      </div>
    </div>
  </div>
);

const Toolbar = ({ placeholder = "Rechercher..." }: { placeholder?: string }) => (
  <div className="flex items-center gap-3">
    <div className="relative flex-1 max-w-md">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
      <input
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
    </div>
    <button className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-slate-50">Actions</button>
  </div>
);

export default function HunterLayout({
  children,
  title,
  subtitle,
  showToolbar = true,
  showNotifications = true
}: HunterLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto p-6 md:p-10 flex flex-col gap-6">
        <Header
          user={user}
          title={title}
          subtitle={subtitle}
          showNotifications={showNotifications}
        />

        {showToolbar && <Toolbar />}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-6"
        >
          {children}
        </motion.div>

      </div>
    </div>
  );
}

// Composants réutilisables pour les pages chasseur
export const StatCard = ({ icon: Icon, label, value, sub }: { icon: any, label: string, value: number | string, sub?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className="rounded-2xl bg-white/70 backdrop-blur border border-slate-200 shadow-sm p-5 flex items-center gap-4"
  >
    <div className="p-3 rounded-xl bg-gradient-to-br from-sky-50 to-sky-100 border border-sky-200">
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <p className="text-slate-500 text-sm">{label}</p>
      <div className="text-2xl font-semibold leading-tight">{value}</div>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  </motion.div>
);

export const Badge = ({ children, tone = "green" }: { children: React.ReactNode, tone?: "green" | "amber" | "red" | "slate" }) => (
  <span
    className={
      "inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-full border " +
      (tone === "green"
        ? "bg-green-50 text-green-700 border-green-200"
        : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : tone === "red"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-slate-50 text-slate-700 border-slate-200")
    }
  >
    {children}
  </span>
);

export const AlertBanner = ({
  type = "warning",
  title,
  message,
  actionText,
  onAction
}: {
  type?: "warning" | "error" | "info",
  title: string,
  message: string,
  actionText?: string,
  onAction?: () => void
}) => {
  const colors = {
    warning: "bg-amber-50/70 border-amber-200 text-amber-900",
    error: "bg-red-50/70 border-red-200 text-red-900",
    info: "bg-blue-50/70 border-blue-200 text-blue-900"
  };

  const iconColors = {
    warning: "bg-amber-100 border-amber-200",
    error: "bg-red-100 border-red-200",
    info: "bg-blue-100 border-blue-200"
  };

  const buttonColors = {
    warning: "bg-amber-600 hover:bg-amber-700",
    error: "bg-red-600 hover:bg-red-700",
    info: "bg-blue-600 hover:bg-blue-700"
  };

  return (
    <div className={`rounded-2xl border p-4 flex items-start gap-3 ${colors[type]}`}>
      <div className={`p-2 rounded-lg border ${iconColors[type]}`}>
        <Bell className="w-4 h-4"/>
      </div>
      <div className="text-sm">
        <div className="font-medium">{title}</div>
        <div>{message}</div>
      </div>
      {actionText && onAction && (
        <div className="ml-auto">
          <button
            onClick={onAction}
            className={`px-3 py-2 text-sm rounded-xl text-white ${buttonColors[type]}`}
          >
            {actionText}
          </button>
        </div>
      )}
    </div>
  );
};

export const EmptyState = ({
  icon: Icon,
  title,
  description
}: {
  icon: any,
  title: string,
  description?: string
}) => (
  <div className="rounded-2xl border bg-slate-50 p-8 text-center">
    <Icon className="w-12 h-12 text-slate-400 mx-auto mb-3" />
    <p className="text-slate-600 font-medium">{title}</p>
    {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
  </div>
);

export const ErrorState = ({
  title = "Erreur de chargement",
  message = "Une erreur s'est produite. Veuillez réessayer."
}: {
  title?: string,
  message?: string
}) => (
  <div className="rounded-2xl border bg-red-50/70 border-red-200 p-4 flex items-start gap-3">
    <Bell className="w-5 h-5 text-red-600 mt-0.5" />
    <div className="text-sm text-red-900">
      <div className="font-medium">{title}</div>
      <div>{message}</div>
    </div>
  </div>
);

export const LoadingState = ({ message = "Chargement..." }: { message?: string }) => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto"></div>
      <p className="mt-4 text-slate-600">{message}</p>
    </div>
  </div>
);
