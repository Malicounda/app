const fs = require('fs');
let code = fs.readFileSync('client/src/components/messaging/InternalMessageList.tsx', 'utf8');

const detailHelper = `
  const getMessageDetails = (message: any) => {
    const isGroupKey = Boolean((message as any)?.isGroupMessage);
    const subject = extractFirstString(message, SUBJECT_KEYS);
    const content = extractContent(message);
    const timestamp = formatDate(extractDate(message));
    const recipient = extractFirstString(message, RECIPIENT_KEYS) || ((): string | null => {
      const extraKeys = ['recipientUsername', 'recipientEmail', 'recipientLogin', 'recipient_user', 'recipient_email'];
      return extractFirstString(message, extraKeys as any);
    })();
    const recipientObj = typeof (message as any).recipient === 'object' && (message as any).recipient ? ((message as any).recipient as Record<string, unknown>) : null;
    const recipientFirstName = typeof recipientObj?.firstName === 'string' ? recipientObj.firstName.trim() : (typeof (message as any).recipientFirstName === 'string' ? (message as any).recipientFirstName.trim() : undefined);
    const recipientLastName = typeof recipientObj?.lastName === 'string' ? recipientObj.lastName.trim() : (typeof (message as any).recipientLastName === 'string' ? (message as any).recipientLastName.trim() : undefined);
    const recipientName = [recipientFirstName, recipientLastName].filter(isNonEmptyString).join(' ');
    const recipientRoleRaw = (() => {
      if (recipientObj && typeof recipientObj.role === 'string' && recipientObj.role.trim()) return (recipientObj.role as string).trim();
      return extractFirstString(message, RECIPIENT_ROLE_KEYS) || null;
    })();
    const recipientRegion = (() => {
      if (typeof recipientObj?.region === 'string' && recipientObj.region.trim()) return recipientObj.region.trim();
      return extractFirstString(message, RECIPIENT_REGION_KEYS) || undefined;
    })();
    const recipientDept = (() => {
      if (typeof (recipientObj as any)?.departement === 'string' && (recipientObj as any).departement.trim()) return ((recipientObj as any).departement as string).trim();
      return extractFirstString(message, RECIPIENT_DEPT_KEYS) || undefined;
    })();

    const senderObj = typeof message.sender === 'object' && message.sender ? (message.sender as Record<string, unknown>) : null;
    const isGroupMsg = Boolean(message.isGroupMessage);
    const senderRoleRaw = (() => {
      if (isGroupMsg && senderObj && typeof senderObj.role === 'string' && senderObj.role.trim()) {
        return (senderObj.role as string).trim();
      }
      for (const key of SENDER_ROLE_KEYS) {
        const value = message[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return null;
    })();

    const senderRoleLabel = senderRoleRaw ? SENDER_ROLE_LABELS[senderRoleRaw] : undefined;
    const senderFirstName = typeof senderObj?.firstName === 'string' ? senderObj.firstName.trim() :
      (typeof message.senderFirstName === 'string' ? message.senderFirstName.trim() : undefined);
    const senderLastName = typeof senderObj?.lastName === 'string' ? senderObj.lastName.trim() :
      (typeof message.senderLastName === 'string' ? message.senderLastName.trim() : undefined);
    const senderBase = !isGroupMsg ? extractFirstString(message, SENDER_KEYS) : null;
    const senderName = [senderFirstName, senderLastName].filter(isNonEmptyString).join(' ');
    const sender = senderRoleLabel
      ? \`\${senderRoleLabel}\${senderName ? \` • \${senderName}\` : ''}\`
      : (senderName || senderBase);

    const attachmentName = extractFirstString(message, ['attachmentName', 'attachment_name']) ?? (message.attachmentPath as string | undefined) ?? null;
    const attachmentSizeRaw = typeof message.attachmentSize === 'number' ? message.attachmentSize : Number(message.attachmentSize ?? 0);
    const attachmentSize = Number.isFinite(attachmentSizeRaw) && attachmentSizeRaw > 0 ? attachmentSizeRaw : null;
    const hasAttachment = isNonEmptyString(attachmentName);

    const metaParts = [] as string[];
    if (context !== 'sent') {
      if (sender) metaParts.push(\`Expéditeur : \${sender}\`);
    } else {
      let roleLabel: string | undefined;
      if (recipientRoleRaw === 'sub-agent') roleLabel = 'Agent secteur';
      else if (recipientRoleRaw === 'agent') roleLabel = 'Agent IREF';
      const targetRole = (message as any)?.targetRole as string | undefined;
      const looksLikeAdmin = (recipientRoleRaw === 'admin') || (typeof targetRole === 'string' && targetRole.toLowerCase() === 'admin') || (typeof (recipient || recipientName) === 'string' && /admin/i.test(String(recipient || recipientName)));
      if (looksLikeAdmin) {
        metaParts.push('Destinataire : Admin');
      } else {
        const assignmentParts: string[] = [];
        if (recipientDept) assignmentParts.push(\`Département \${recipientDept}\`);
        if (recipientRegion) assignmentParts.push(\`Région \${recipientRegion}\`);
        const assignment = assignmentParts.join(' / ');
        const baseName = recipientName || recipient || undefined;
        const composed = [baseName, roleLabel, assignment ? \`— \${assignment}\` : ''].filter(isNonEmptyString).join(' ');
        if (composed) metaParts.push(\`Destinataire : \${composed}\`);
        else {
          const isRegionalAgent = normalizedRole === 'agent' && (user as any)?.type !== 'secteur';
          if (isRegionalAgent) metaParts.push('Destinataire : Admin');
        }
      }
    }
    const meta = metaParts.join(' • ');
    const numericId = typeof message.id === 'number' ? message.id : NaN;
    const isUnread = context === 'inbox' && (message as any)?.isRead === false && !(Number.isFinite(numericId) && openedRef.current.has(numericId as number));

    return { subject, content, timestamp, sender, attachmentName, attachmentSize, hasAttachment, meta, isGroupKey, isUnread };
  };

  const renderDetailView = () => {
    if (!selectedMessage) return null;
    const { subject, content, timestamp, sender, attachmentName, attachmentSize, hasAttachment, meta } = getMessageDetails(selectedMessage);
    
    return (
      <div className="flex-1 overflow-auto rounded-md bg-white w-full flex flex-col border shadow-sm relative z-10">
        {/* En-tête avec bouton retour */}
        <div className="flex items-center justify-between p-3 border-b sticky top-0 bg-white">
          <Button variant="ghost" size="icon" onClick={() => setSelectedMessage(null)} className="hover:bg-gray-100" title="Retour à la liste">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {context === 'inbox' && normalizedRole !== 'hunter' && normalizedRole !== 'hunting-guide' && (
              <Button variant="ghost" size="icon" className="text-gray-600 hover:text-gray-800" onClick={() => { setForwardFor(selectedMessage); setForwardSubject(subject || ''); setForwardContent(''); setForwardError(null); }} title="Transférer">
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => requestDelete(selectedMessage)} title="Supprimer">
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Corps du message */}
        <div className="p-6 flex-1 overflow-y-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{subject || "Message interne"}</h2>
          
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold uppercase shrink-0">
                {(sender || meta || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-gray-900 text-sm">{meta}</div>
                <div className="text-xs text-gray-500">{timestamp}</div>
              </div>
            </div>
            {context === 'sent' && Array.isArray((selectedMessage as any).readers) && (selectedMessage as any).readers.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs text-green-700" onClick={() => setReaderDetailFor(selectedMessage)}>
                Voir les accusés de lecture
              </Button>
            )}
          </div>
          
          <div className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed pl-13">
            {content}
          </div>
          
          {hasAttachment && (
            <div className="mt-8 pt-4 border-t border-gray-100 flex flex-col items-start gap-2">
              <div className="text-sm font-semibold text-gray-700">Pièces jointes</div>
              <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center"><MailIcon className="h-4 w-4 text-gray-500"/></div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{attachmentName}</span>
                  <span className="text-xs text-gray-500">{attachmentSize ? formatFileSize(attachmentSize) : ''}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => openAttachmentPreview(selectedMessage)}>Aperçu</Button>
              </div>
            </div>
          )}
          
          {/* Actions bas de page */}
          {context === 'inbox' && (
            <div className="mt-8 pt-4 flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => {
                setReplyFor(selectedMessage);
                const senderObj = typeof selectedMessage.sender === 'object' && selectedMessage.sender ? (selectedMessage.sender as any) : null;
                const identifier = ((typeof senderObj?.username === 'string' && senderObj.username.trim()) || (typeof (selectedMessage as any).senderUsername === 'string' && String((selectedMessage as any).senderUsername).trim()) || (typeof senderObj?.email === 'string' && senderObj.email.trim()) || (typeof (senderObj as any)?.matricule === 'string' && String((senderObj as any).matricule).trim()) || (typeof (selectedMessage as any)?.senderId === 'number' && Number.isFinite((selectedMessage as any).senderId) ? String((selectedMessage as any).senderId) : '')) as string;
                setReplyRecipient(identifier);
                setReplyContent('');
              }}>
                <MailIcon className="h-4 w-4" /> Répondre
              </Button>
              {normalizedRole !== 'hunter' && normalizedRole !== 'hunting-guide' && (
                <Button variant="outline" className="gap-2" onClick={() => { setForwardFor(selectedMessage); setForwardSubject(subject || ''); setForwardContent(''); setForwardError(null); }}>
                  <Share2 className="h-4 w-4" /> Transférer
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };
`;

code = code.replace(/return \(\s*<div className="w-full h-full flex flex-col">\s*\{\(\(\) => \{/, detailHelper + '\n\n  return (\n    <div className="w-full h-full flex flex-col">\n      {selectedMessage ? renderDetailView() : (\n        <>\n        {(() => {');

// Wrap the end of the return
code = code.replace(/<\/div>\s*<MessageAttachmentViewer payload=\{preview\} onClose=\{closePreview\} \/>/, '        </>\n      )}\n      </div>\n      <MessageAttachmentViewer payload={preview} onClose={closePreview} />');

// Now update the map loop to extract using the helper, and change the UI.
const mapStart = '            {paginatedMessages.map((message, index) => {';
const mapEndIndex = code.indexOf('          </div>', code.indexOf(mapStart));
const oldMapBody = code.substring(code.indexOf(mapStart), mapEndIndex);

const newMapBody = `            {paginatedMessages.map((message, index) => {
              const { subject, content, timestamp, sender, hasAttachment, meta, isUnread } = getMessageDetails(message);
              const key = typeof message.id === "number" ? \`msg-\${message.id}\` : \`\${page}-\${index}\`;
              return (
                <article
                  key={key}
                  className={\`group rounded-lg border p-0 shadow-sm cursor-pointer transition-all hover:border-gray-300 hover:shadow-md \${
                    message.isPending ? 'border-amber-200 bg-amber-50/50 border-l-4 border-l-amber-500'
                      : isUnread ? 'border-gray-200 bg-white border-l-4 border-l-green-600'
                      : 'border-gray-100 bg-gray-50/80 text-gray-500'
                  }\`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    toggleOpen(message);
                    setSelectedMessage(message);
                  }}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Icon Unread / Read */}
                    <div className={\`shrink-0 h-8 w-8 rounded-full flex items-center justify-center \${isUnread ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}\`}>
                      {isUnread ? <MailIcon className="h-4 w-4" /> : <MailOpenIcon className="h-4 w-4" />}
                    </div>
                    
                    {/* Meta / Expéditeur */}
                    <div className="w-[180px] shrink-0 truncate font-medium text-sm">
                      {context === 'inbox' ? sender || 'Inconnu' : meta.replace('Destinataire : ', '') || 'Inconnu'}
                    </div>

                    {/* Sujet et Extrait */}
                    <div className="flex-1 min-w-0 flex items-center gap-2 truncate">
                      <span className={\`text-sm truncate \${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}\`}>
                        {subject || "Message interne"}
                      </span>
                      <span className="text-gray-400 text-sm truncate">
                        - {content}
                      </span>
                    </div>

                    {/* Has Attachment Icon */}
                    {hasAttachment && (
                      <div className="shrink-0 text-gray-400">
                        <MailIcon className="h-4 w-4" />
                      </div>
                    )}

                    {/* Date */}
                    <div className="shrink-0 text-xs font-medium text-gray-500 w-24 text-right">
                      {timestamp}
                    </div>
                    
                    {/* Actions au survol */}
                    <div className="shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                       {onDelete && (
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); requestDelete(message); }} title="Supprimer">
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       )}
                    </div>
                  </div>
                </article>
              );
            })}`;

code = code.replace(oldMapBody, newMapBody);

fs.writeFileSync('client/src/components/messaging/InternalMessageList.tsx', code);
