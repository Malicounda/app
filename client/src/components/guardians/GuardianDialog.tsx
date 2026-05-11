import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuardianForm } from "./GuardianForm";
import { type Guardian } from "@shared/schema";

type GuardianDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Guardian, "id" | "createdAt">) => void;
  isSubmitting?: boolean;
  defaultValues?: Partial<Omit<Guardian, "id" | "createdAt">>;
  title?: string;
  description?: string;
};

export function GuardianDialog({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  defaultValues = {},
  title = "Ajouter un tuteur",
  description = "Remplissez les informations du tuteur pour le chasseur mineur.",
}: GuardianDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <GuardianForm
          onSubmit={onSubmit}
          defaultValues={defaultValues}
          isSubmitting={isSubmitting}
          submitLabel={Object.keys(defaultValues).length > 0 ? "Mettre à jour" : "Ajouter"}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
