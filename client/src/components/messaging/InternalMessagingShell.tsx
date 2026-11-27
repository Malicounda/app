import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import InternalMessageComposer, {
  type InternalMessageComposerRegionOption,
  type InternalMessageComposerSubmitPayload,
  type InternalMessageComposerTarget,
} from "@/components/messaging/InternalMessageComposer";
import InternalMessageList from "@/components/messaging/InternalMessageList";
import type { InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { Inbox, Mail, PenSquare, Search, Send, X } from "lucide-react";
import { useState } from "react";

interface InternalMessagingShellProps {
  title?: string;
  activeTab: "reçus" | "envoyés";
  onTabChange: (tab: "reçus" | "envoyés") => void;
  query: string;
  onQueryChange: (value: string) => void;
  inbox: InternalMessageRecord[];
  filteredInbox: InternalMessageRecord[];
  sent: InternalMessageRecord[];
  filteredSent: InternalMessageRecord[];
  loadingInbox?: boolean;
  loadingSent?: boolean;
  sending?: boolean;
  inboxOnly?: boolean;
  onRefreshInbox?: () => void;
  onRefreshSent?: () => void;
  onDelete?: (message: InternalMessageRecord) => Promise<void> | void;
  onStaleMessage?: (message: InternalMessageRecord) => void;
  onReply?: (payload: {
    recipientIdentifier: string;
    content: string;
    attachment?: File | null;
    original: InternalMessageRecord;
  }) => Promise<void> | void;
  onSubmitCompose?: (
    payload: InternalMessageComposerSubmitPayload
  ) => Promise<boolean> | boolean;
  regionTargets?: InternalMessageComposerTarget[];
  allowIndividual?: boolean;
  allowGroup?: boolean;
  regionOptions?: InternalMessageComposerRegionOption[];
  defaultRegionValue?: string;
  adminRecipients?: Array<{ value: string; label: string }>;
  showAdminQuickPick?: boolean;
}

export default function InternalMessagingShell({
  title = "Messagerie interne",
  activeTab,
  onTabChange,
  query,
  onQueryChange,
  inbox,
  filteredInbox,
  sent,
  filteredSent,
  loadingInbox,
  loadingSent,
  sending,
  inboxOnly = false,
  onRefreshInbox,
  onRefreshSent,
  onDelete,
  onStaleMessage,
  onReply,
  onSubmitCompose,
  regionTargets = [],
  allowIndividual = true,
  allowGroup = true,
  regionOptions = [],
  defaultRegionValue,
  adminRecipients = [],
  showAdminQuickPick = false,
}: InternalMessagingShellProps) {
  const [composeOpen, setComposeOpen] = useState(false);

  const safeInbox = Array.isArray(inbox) ? inbox : [];
  const safeSent = Array.isArray(sent) ? sent : [];
  const unreadCount = safeInbox.filter((m: any) => m?.isRead === false).length;
  const canCompose = !inboxOnly && typeof onSubmitCompose === "function";

  const handleComposeSubmit = async (
    payload: InternalMessageComposerSubmitPayload
  ): Promise<boolean> => {
    if (!onSubmitCompose) return false;
    const ok = await onSubmitCompose(payload);
    if (ok) {
      setComposeOpen(false);
    }
    return ok;
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <section className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm min-h-[70vh] lg:h-[calc(100vh-8.5rem)]">
        {/* Niveau 1 : En-tête principal + bouton Nouveau message */}
        <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 border border-green-100">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                  {title}
                </h1>
                <p className="text-xs text-gray-500">
                  {activeTab === "reçus"
                    ? `${safeInbox.length} message${safeInbox.length > 1 ? "s" : ""} reçu${safeInbox.length > 1 ? "s" : ""}${unreadCount > 0 ? ` • ${unreadCount} non lu${unreadCount > 1 ? "s" : ""}` : ""}`
                    : `${safeSent.length} message${safeSent.length > 1 ? "s" : ""} envoyé${safeSent.length > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {canCompose && (
              <Button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="bg-green-700 hover:bg-green-800 text-white rounded-lg shadow-sm gap-2 px-4 h-9 sm:h-10 text-xs sm:text-sm font-medium shrink-0"
              >
                <PenSquare className="h-4 w-4" />
                <span>Nouveau message</span>
              </Button>
            )}
          </div>
        </div>

        {/* Niveau 2 : Onglets Reçus / Envoyés + Barre de recherche */}
        <div className="shrink-0 border-b border-gray-200 bg-gray-50/70 px-4 py-2.5 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100/90 p-1 self-start">
              <button
                type="button"
                onClick={() => onTabChange("reçus")}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                  activeTab === "reçus"
                    ? "bg-white text-green-800 shadow-sm ring-1 ring-gray-200/80"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Inbox className="h-3.5 w-3.5" />
                <span>Reçus</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                    unreadCount > 0
                      ? "bg-green-700 text-white"
                      : activeTab === "reçus"
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-200/80 text-gray-600"
                  }`}
                >
                  {safeInbox.length}
                </span>
              </button>

              {!inboxOnly && (
                <button
                  type="button"
                  onClick={() => onTabChange("envoyés")}
                  className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                    activeTab === "envoyés"
                      ? "bg-white text-green-800 shadow-sm ring-1 ring-gray-200/80"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Envoyés</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                      activeTab === "envoyés"
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-200/80 text-gray-600"
                    }`}
                  >
                    {safeSent.length}
                  </span>
                </button>
              )}
            </div>

            <div className="relative flex items-center w-full sm:w-72 md:w-80">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Rechercher un message, un expéditeur..."
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-sm text-gray-800 placeholder:text-gray-400 shadow-xs outline-none transition-colors focus:border-green-600 focus:ring-2 focus:ring-green-600/15"
              />
              {query.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="absolute right-2.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Liste des messages (100 % largeur, ultra aérée) */}
        <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-5 bg-white">
          {activeTab === "reçus" && (
            <InternalMessageList
              messages={filteredInbox}
              loading={loadingInbox}
              emptyLabel="Aucun message reçu pour le moment."
              onDelete={onDelete}
              onRefresh={onRefreshInbox}
              onStaleMessage={onStaleMessage}
              onReply={onReply}
            />
          )}

          {!inboxOnly && activeTab === "envoyés" && (
            <InternalMessageList
              messages={filteredSent}
              loading={loadingSent}
              emptyLabel="Aucun message envoyé pour le moment."
              context="sent"
              onDelete={onDelete}
              onRefresh={onRefreshSent}
              onStaleMessage={onStaleMessage}
            />
          )}
        </div>
      </section>

      {/* Tiroir latéral (PC/tablette) / Panneau plein écran (mobile) pour composer */}
      {canCompose && (
        <Sheet open={composeOpen} onOpenChange={setComposeOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg p-0 flex flex-col bg-white"
          >
            <SheetHeader className="shrink-0 border-b border-gray-200 px-5 py-4 text-left bg-gray-50/70">
              <div className="flex items-center gap-3 pr-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-700 text-white">
                  <PenSquare className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-base font-semibold text-gray-900">
                    Nouveau message
                  </SheetTitle>
                  <SheetDescription className="text-xs text-gray-500">
                    Envoi individuel ou groupé avec pièce jointe
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <InternalMessageComposer
                loading={sending}
                onSubmit={handleComposeSubmit}
                regionTargets={regionTargets}
                allowIndividual={allowIndividual}
                allowGroup={allowGroup}
                regionOptions={regionOptions}
                defaultRegionValue={defaultRegionValue}
                adminRecipients={adminRecipients}
                showAdminQuickPick={showAdminQuickPick}
                onCancel={() => setComposeOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
