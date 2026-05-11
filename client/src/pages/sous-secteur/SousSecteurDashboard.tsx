import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import {
  Bell,
  FileText,
  MapPin,
  MessageSquare,
  User,
  BarChart3,
} from "lucide-react";

const NAV_CARDS = [
  {
    href: "/sous-secteur/profile",
    icon: User,
    title: "Mon Profil",
    description: "Consulter et modifier vos informations personnelles",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    href: "/sous-secteur/sms",
    icon: MessageSquare,
    title: "Messagerie",
    description: "Envoyer et recevoir des messages internes",
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    href: "/sous-secteur/infractions",
    icon: FileText,
    title: "Infractions",
    description: "Consulter et enregistrer les infractions",
    color: "text-red-600",
    bg: "bg-red-50",
  },
  {
    href: "/sous-secteur/carte",
    icon: MapPin,
    title: "Carte",
    description: "Visualiser les données géographiques",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    href: "/sous-secteur/alertes",
    icon: Bell,
    title: "Alertes",
    description: "Voir les alertes et signalements",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    href: "/sous-secteur/statistiques",
    icon: BarChart3,
    title: "Statistiques",
    description: "Consulter les statistiques de votre secteur",
    color: "text-teal-600",
    bg: "bg-teal-50",
  },
];

export default function SousSecteurDashboard() {
  const { user } = useAuth();

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
          <User className="h-5 w-5 text-teal-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Espace Sous-Secteur
          </h1>
          <p className="text-sm text-gray-500">
            Bienvenue, {user?.firstName || user?.username || ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {NAV_CARDS.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className={`h-10 w-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <CardTitle className="text-base font-semibold">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">{card.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
