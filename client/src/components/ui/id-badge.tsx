import { User, UserRound, Users } from "lucide-react";

interface IdBadgeProps {
  id: number | string;
  type: "hunter" | "guide" | "agent";
}

/**
 * Component pour afficher des IDs sous forme d'icône colorée avec un tooltip qui montre l'ID au survol
 * - hunter: icône de chasseur jaune
 * - guide: icône de guide bleu
 * - agent: icône d'agent vert
 */
export function IdBadge({ id, type }: IdBadgeProps) {
  // Déterminer l'icône et les couleurs en fonction du type
  const getIconAndColor = () => {
    switch (type) {
      case "hunter":
        return {
          icon: <User className="h-4 w-4" />,
          bgColor: "bg-amber-100",
          textColor: "text-amber-700",
          borderColor: "border-amber-200",
          hoverBgColor: "hover:bg-amber-200"
        };
      case "guide":
        return {
          icon: <UserRound className="h-4 w-4" />,
          bgColor: "bg-blue-100",
          textColor: "text-blue-700",
          borderColor: "border-blue-200",
          hoverBgColor: "hover:bg-blue-200"
        };
      case "agent":
        return {
          icon: <Users className="h-4 w-4" />,
          bgColor: "bg-green-100",
          textColor: "text-green-700",
          borderColor: "border-green-200",
          hoverBgColor: "hover:bg-green-200"
        };
      default:
        return {
          icon: <User className="h-4 w-4" />,
          bgColor: "bg-gray-100",
          textColor: "text-gray-700",
          borderColor: "border-gray-200",
          hoverBgColor: "hover:bg-gray-200"
        };
    }
  };

  const { icon, bgColor, textColor, borderColor, hoverBgColor } = getIconAndColor();

  return (
    <div
      className={`inline-flex items-center justify-center p-1.5 rounded-full border ${bgColor} ${textColor} ${borderColor} ${hoverBgColor} select-none`}
      aria-label={typeof type === 'string' ? `Badge ${type}` : 'Badge utilisateur'}
    >
      {icon}
    </div>
  );
}
