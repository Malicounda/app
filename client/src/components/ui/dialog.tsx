import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

const restoreBodyInteraction = () => {
  try {
    document.body.style.removeProperty('pointer-events');
    document.body.style.pointerEvents = "";
    document.body.style.removeProperty('overflow');
    document.body.style.overflow = "";
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.overflow = "";
    document.body.removeAttribute('data-scroll-locked');
    document.documentElement.removeAttribute('data-scroll-locked');
  } catch {}
}

const scheduleRestore = (triesLeft = 8) => {
  setTimeout(() => {
    restoreBodyInteraction()
    if (triesLeft > 0 && document.body?.style?.pointerEvents === 'none') {
      scheduleRestore(triesLeft - 1)
    }
  }, 80)
}

const Dialog = ({ onOpenChange, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root
    {...props}
    onOpenChange={(open) => {
      if (!open && document.body.hasAttribute("data-session-locked")) {
        // Session verrouillée : empêcher la fermeture du dialog pour préserver les données du formulaire
        return;
      }
      if (!open) {
        scheduleRestore()
      }
      onOpenChange?.(open)
    }}
  />
)

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    onAnimationEnd={(e) => {
      try {
        const state = (e.currentTarget as HTMLElement)?.dataset?.state
        if (state === 'closed') {
          scheduleRestore()
        }
      } catch {}
      props.onAnimationEnd?.(e)
    }}
    ref={ref}
    className={cn(
      "fixed inset-0 z-[10000] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  hideClose?: boolean;
  overlayClassName?: string;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideClose, overlayClassName, ...props }, ref) => {
  const { ["aria-describedby"]: ariaDescribedBy, ...restProps } = props as React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Content
  > & { ["aria-describedby"]?: string }

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        ref={ref}
        onAnimationEnd={(e) => {
          try {
            const state = (e.currentTarget as HTMLElement)?.dataset?.state
            if (state === 'closed') {
              scheduleRestore()
            }
          } catch {}
          ;(restProps as any).onAnimationEnd?.(e)
        }}
        className={cn(
          "fixed left-[50%] top-[50%] z-[10010] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg data-[state=closed]:pointer-events-none",
          className
        )}
        aria-describedby={ariaDescribedBy ?? undefined}
        {...restProps}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger
}

