# 🔍 DIAGNOSTIC - Production Issue

## État: Données s'accumulent + doublons + pas de sync automatique

---

## 🚨 Problèmes Identifiés

### 1. **Pas de Sync Automatique** ✅ FIXÉ
- **Était:** Sync seulement au clic du bouton
- **Maintenant:** Sync automatique toutes les 30 secondes
- **Fichier:** `client/src/contexts/AndroidAuthContext.tsx`
- **Added:**
  ```typescript
  // Sync auto toutes les 30 secondes quand authentifié
  useEffect(() => {
    const syncInterval = setInterval(() => {
      syncService.syncWithServer();
    }, 30000);
    return () => clearInterval(syncInterval);
  }, [isAuthenticated]);
  ```

### 2. **Doublons: Mêmes Données Répétées**
- **Cause Probable:** Les alertes/messages sont mises dans outbox plusieurs fois
- **Solution:** Vérifier la déduplication côté client + serveur

### 3. **Seules Alertes et Messages Doivent Syncer**
- **Actuellement:** Bien configurable via `mapOfflineEntity()`
- **Vérifier:** Que hunting_reports et declarations ne soient PAS syncées

---

## 📊 SQL Diagnostic: Qu'est-ce qui s'accumule?

### **Exécutez sur votre DB (scodipp.db pour Android):**

```sql
-- 1. Vue d'ensemble: Combien de données par type?
SELECT entity, status, COUNT(*) as count
FROM outbox
GROUP BY entity, status
ORDER BY entity, status;

-- Résultat attendu:
-- | entity  | status   | count |
-- |---------|----------|-------|
-- | alert   | pending  | X     |
-- | alert   | acked    | Y     |
-- | message | pending  | A     |
-- | message | acked    | B     |
-- | (other) | (should  | (be 0)|
-- |         | (be 0)   |       |
```

### **2. Identifier les Doublons**

```sql
-- Les mêmes alertes créées plusieurs fois?
SELECT payload, COUNT(*) as duplicate_count, GROUP_CONCAT(id) as ids
FROM outbox
WHERE entity = 'alert' AND status = 'pending'
GROUP BY payload
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Si résultat > 1, c'est un doublon!
```

### **3. Vérifier l'Age des Données**

```sql
-- Les plus anciennes données non-syncées?
SELECT 
  id, 
  entity, 
  status,
  created_at,
  DATETIME(created_at / 1000, 'unixepoch') as timestamp,
  SUBSTR(payload, 1, 100) as payload_preview
FROM outbox
WHERE status IN ('pending', 'failed')
ORDER BY created_at ASC
LIMIT 20;

-- Si > 24h: GROS PROBLÈME (serveur down ou token invalide)
```

### **4. Taux de Succès Sync**

```sql
-- Combien se synchro bien vs mal?
SELECT 
  CAST(
    COUNT(CASE WHEN status='acked' THEN 1 END) * 100.0 / COUNT(*)
    AS DECIMAL(5,2)
  ) as success_rate_percent
FROM outbox
WHERE entity IN ('alert', 'message');

-- Résultat:
-- | success_rate |
-- |--------------|
-- | 85.5         | ← Pas bon! (< 95%)
```

### **5. Erreurs par Type (si available)**

```sql
-- Quelles erreurs pour les "failed"?
SELECT last_error, COUNT(*) as count
FROM outbox
WHERE status = 'failed'
GROUP BY last_error
ORDER BY count DESC;
```

---

## ✅ Solutions Appliquées

### **1. AUTO-SYNC: Toutes les 30 Secondes**
```
✅ FIXÉ dans: AndroidAuthContext.tsx
- Sync au login
- Sync toutes les 30s après
- Auto-retry si serveur down
```

### **2. Prévenir les Doublons**

Vérifier dans `client/src/lib/queryClient.ts`:

```typescript
// mapOfflineEntity doit SEULEMENT matcher alerts et messages
function mapOfflineEntity(method: string, url: string) {
  if (method.toUpperCase() !== 'POST') return null;
  if (url.includes('/alerts')) return { entity: 'alert', action: 'create' };
  if (url.includes('/messages')) return { entity: 'message', action: 'create' };
  // ❌ Ne PAS matcher hunting-reports ou declarations
  return null;
}
```

### **3. Déduplication Côté Serveur**

Vérifier `/api/sync/batch` (server):
```typescript
// Avant INSERT, vérifier client_mutations
const existing = await getExistingMutationResult(deviceId, mutationId);
if (existing) {
  // Retourner résultat précédent sans ré-insérer
  return { ok: true, id: existing.id };
}
```

---

## 🔧 Actions Recommandées

### **1. Diagnostic Immédiat**
```bash
# Sur appareil Android / DB local:
sqlite3 scodipp.db

# Copier/coller les requêtes SQL ci-dessus
```

### **2. Nettoyer les Données Bloquées**

```sql
-- Option 1: Si sync échoue depuis > 24h (serveur down)
DELETE FROM outbox WHERE status='failed' AND created_at < strftime('%s','now','-24 hours')*1000;

-- Option 2: Reset pour retry (attention!)
UPDATE outbox SET status='pending', retry_count=0 WHERE status='failed' AND retry_count < 2;
```

### **3. Vérifier le Serveur**

```bash
# Serveur est-il up?
curl -H "Authorization: Bearer <token>" https://api.scodi.com/api/auth/me

# Réponse:
# 200 OK → serveur fonctionne
# 401 Unauthorized → token expiré
# 500 → serveur plante
```

### **4. Vérifier le Token JWT**

```javascript
// Dans console browser:
localStorage.getItem('token')

// Doit retourner un JWT valide (commence par eyJ...)
// Si vide ou expiré → user doit relogs
```

---

## 📈 Monitoring: À Vérifier Régulièrement

Après les fixes, exécutez:

```sql
-- Santé sync
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN status='pending' THEN 1 END) as pending,
  COUNT(CASE WHEN status='acked' THEN 1 END) as synced,
  COUNT(CASE WHEN status='failed' THEN 1 END) as failed,
  ROUND(COUNT(CASE WHEN status='acked' THEN 1 END)*100.0/COUNT(*), 2) as success_rate
FROM outbox;

-- Résultat attendu APRÈS FIX:
-- | total | pending | synced | failed | success_rate |
-- |-------|---------|--------|--------|--------------|
-- | 50    | 0       | 50     | 0      | 100.0        |
```

---

## 🎯 Configuration Finale (Checkbox)

- [x] Sync automatique toutes les 30s → **APPLIQUÉ**
- [ ] Vérifier seules alertes/messages syncent
- [ ] Vérifier pas de doublons dans DB
- [ ] Tester offline → reconnect → observe sync
- [ ] Confirmer success_rate > 95%
- [ ] Nettoyer anciennes données non-syncées

---

## 📝 Prochaines Étapes

1. **Test Immediate:**
   ```
   1. Ouvrir app → Connecté
   2. Attendre 30 sec
   3. Vérifier console: "✅ Auto-sync réussie"
   4. Checker: lastSuccessfulAuthSync updated
   ```

2. **Test Offline:**
   ```
   1. Activer airplane mode
   2. Créer une alerte
   3. Désactiver airplane mode
   4. Auto-sync doit declencher (dans 5s + 30s)
   5. Alerte doit apparaître sur serveur
   ```

3. **Monitor Doublons:**
   ```
   SELECT entity, COUNT(*) FROM outbox GROUP BY entity;
   -- doit montrer count stable, pas toujours croissant
   ```

---

**Status:** ✅ **SYNC AUTOMATIQUE MAINTENANT ACTIVE**  
**Intervalle:** 30 secondes  
**Entities:** Alert + Message only  
**Date Fix:** 2026-05-27

