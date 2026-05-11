import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> & { debug?: boolean }
>(({ className, src, onError, debug = false, ...props }, ref) => {
  // Log de débogage pour suivre le chargement des images
  React.useEffect(() => {
    if (debug) {
      console.group('AvatarImage Debug');
      console.log('Source de l\'image:', src);
      console.log('Props:', { className, ...props });
      console.groupEnd();
    }
  }, [src, className, debug, props]);

  const handleError = React.useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (debug) {
      console.error('Erreur de chargement de l\'image:', {
        src,
        event: e,
        target: e.currentTarget
      });
    }
    
    // Appeler le gestionnaire d'erreur parent s'il existe
    if (onError) {
      onError(e);
    }
  }, [src, onError, debug]);

  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      src={src}
      onError={handleError}
      {...props}
    />
  );
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }