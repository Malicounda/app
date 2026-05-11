import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const linkHunterSchema = z.object({
  userId: z.number(),
  hunterId: z.number(),
  notes: z.string().optional()
});

type LinkHunterFormData = z.infer<typeof linkHunterSchema>;

interface LinkHunterProfileProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId?: number;
  hunterId?: number;
}

export function LinkHunterProfile({
  open,
  onClose,
  onSuccess,
  userId,
  hunterId
}: LinkHunterProfileProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LinkHunterFormData>({
    resolver: zodResolver(linkHunterSchema),
    defaultValues: {
      userId: userId || 0,
      hunterId: hunterId || 0,
      notes: ''
    }
  });

  const onSubmit = async (data: LinkHunterFormData) => {
    try {
      setIsSubmitting(true);
      await apiRequest({
        url: '/api/admin/link-hunter-profile',
        method: 'POST',
        data
      });

      toast({
        title: 'Succès',
        description: 'Le profil chasseur a été associé avec succès',
      });
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de l\'association du profil',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Associer un profil chasseur</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID Utilisateur</FormLabel>
                  <Input {...field} type="number" />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hunterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID Chasseur</FormLabel>
                  <Input {...field} type="number" />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <Input {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Association...' : 'Associer'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
