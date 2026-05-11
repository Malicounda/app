import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Guardian } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";

type GuardianDetailsProps = {
  guardian: Guardian;
  onEdit?: () => void;
  onDelete?: () => void;
  isAdmin?: boolean;
};

export function GuardianDetails({ guardian, onEdit, onDelete, isAdmin = false }: GuardianDetailsProps) {
  const formatDate = (dateString: Date | string) => {
    if (!dateString) return "";
    const date = typeof dateString === "string" ? new Date(dateString) : dateString;
    return format(date, "dd MMMM yyyy", { locale: fr });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Informations du tuteur</CardTitle>
        <CardDescription>
          Détails du tuteur enregistré le {formatDate(guardian.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-sm">Nom</Label>
            <div className="text-lg font-medium">{guardian.lastName}</div>
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Prénom</Label>
            <div className="text-lg font-medium">{guardian.firstName}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-sm">Numéro de pièce d'identité</Label>
            <div className="text-base font-medium">{guardian.idNumber}</div>
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Relation avec le mineur</Label>
            <div className="text-base font-medium">{guardian.relationship}</div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-sm">Téléphone</Label>
            <div className="text-base">{guardian.phone || "-"}</div>
          </div>
          <div>
            <Label className="text-muted-foreground text-sm">Adresse</Label>
            <div className="text-base">{guardian.address || "-"}</div>
          </div>
        </div>

        {(onEdit || onDelete) && (
          <div className="flex justify-end gap-2 mt-4">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            )}
            {onDelete && isAdmin && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
