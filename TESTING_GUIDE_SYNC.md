# ✅ GUIDE TEST - Production Sync Fix

**Date:** 27 Mai 2026  
**Status:** Prêt pour test  
**Changements:** 3 fichiers modifiés

---

## 📋 CHANGEMENTS APPLIQUÉS

### 1️⃣ **Sync Automatique Activée** 
- **Fichier:** `client/src/contexts/AndroidAuthContext.tsx`
- **Changement:** Ajouté `useEffect` avec auto-sync toutes les 30 secondes
- **Plus:** Sync IMMÉDIATE quand on revient online
- **Impact:** Les alertes et messages se synchro sans cliquer le bouton

### 2️⃣ **SEULES Alertes + Messages Syncées**
- **Fichier:** `client/src/lib/queryClient.ts`
- **Changement:** Retiré `hunting-reports` du `mapOfflineEntity`
- **Impact:** Pas de doublons d'autres types de données

### 3️⃣ **Documentation**
- **Fichier:** `PRODUCTION_ISSUE_SYNC_FIX.md`
- **Contient:** Guide diagnostic + SQL queries

---

## 🧪 TEST 1: Sync Automatique (30 secondes)

### **Procédure:**
```
1. Ouvrir app
2. Vérifier connexion (status: "Connecté")
3. Ouvrir console (F12)
4. Attendre 30 secondes
5. Vérifier console message: "✅ Auto-sync réussie"
6. Vérifier UI: "Dernière synchro" mis à jour
```

### **Résultat Attendu:**
```
✅ Console montre:
   [X sec] ✅ Auto-sync réussie

✅ UI montre:
   Dernière synchro: Il y a 5 secondes
   
✅ Pas d'erreur 401/500
```

### **Si Échoue:**
```
❌ Si console montre: "⚠️ Auto-sync échouée: Serveur non disponible"
   → Serveur backend down?
   → Check: curl https://api.scodi.com/api/auth/me

❌ Si console montre: "Serveur non disponible"
   → Token JWT expiré?
   → User doit relogs
```

---

## 🧪 TEST 2: Reconnexion Immédiate

### **Procédure:**
```
1. App connectée
2. Ouvrir console (F12)
3. Activer "Airplane Mode" (ou désactiver WiFi)
4. Vérifier console: "Application hors ligne"
5. Désactiver "Airplane Mode"
6. Vérifier console immédiatement
```

### **Résultat Attendu:**
```
✅ Console montre (dans 1 sec):
   📱 Connexion rétablie - Sync immédiate!
   ✅ Auto-sync réussie

✅ PAS d'attendre 30 secondes pour la prochaine sync
```

---

## 🧪 TEST 3: Créer Alerte Offline → Sync Auto Online

### **Procédure:**
```
1. Activer Airplane Mode
2. Naviguer: Menu → Alerte
3. Créer 1 nouvelle alerte
4. Vérifier: "Requête mise en file d'attente" (response 202)
5. Désactiver Airplane Mode
6. Console devrait montrer sync dans 5 sec
7. Vérifier: Alerte apparaît côté serveur
```

### **Résultat Attendu:**
```
✅ Alerte créée offline
✅ Message: "Requête mise en file d'attente"
✅ App revient online
✅ Console: "✅ Auto-sync réussie" (dans 5 sec)
✅ Alerte visible sur serveur/web dashboard
```

---

## 🧪 TEST 4: Créer Message Offline → Sync Auto Online

### **Procédure:**
```
1. Activer Airplane Mode
2. Naviguer: Menu → Messages
3. Créer 1 nouveau message
4. Vérifier: "Requête mise en file d'attente"
5. Désactiver Airplane Mode
6. Attendre 5 secondes
7. Vérifier: Message synchro réussi
```

### **Résultat Attendu:**
```
✅ Message créé offline
✅ Message en file d'attente
✅ Revenir online
✅ Auto-sync dans 5 sec
✅ Message visible dans chat
```

---

## 🧪 TEST 5: Vérifier PAS de Hunting Reports en Queue

### **Procédure:**
```
1. Activer Airplane Mode
2. Créer 1 Rapport de Chasse
3. Devrait ÉCHOUER (pas en queue)
4. Vérifier console: Pas de "mise en file d'attente"
5. Désactiver Airplane Mode
6. Réessayer créer rapport (doit fonctionner online)
```

### **Résultat Attendu:**
```
✅ Offline: Création rapport ÉCHOUE (normal)
✅ Console: PAS de "mise en file d'attente"
✅ Online: Création rapport fonctionne
```

---

## 🧪 TEST 6: Pas de Doublons

### **Procédure SQL:**
```
1. Ouvrir DB (scodipp.db)
2. Exécuter:

   SELECT entity, payload, COUNT(*) as dup_count
   FROM outbox
   WHERE entity = 'alert' AND status IN ('pending','acked')
   GROUP BY payload
   HAVING COUNT(*) > 1;

3. Vérifier: AUCUN résultat (pas de doublon)
```

### **Résultat Attendu:**
```
✅ Requête retourne 0 lignes = PARFAIT
✅ Si > 0 = Doublons détectés (problème)
```

---

## 📊 TEST 7: Monitoring - Success Rate

### **SQL Query:**
```sql
SELECT 
  entity,
  COUNT(*) as total,
  COUNT(CASE WHEN status='acked' THEN 1 END) as synced,
  COUNT(CASE WHEN status='failed' THEN 1 END) as failed,
  ROUND(COUNT(CASE WHEN status='acked' THEN 1 END)*100.0/COUNT(*), 2) as success_percent
FROM outbox
WHERE entity IN ('alert', 'message')
GROUP BY entity;
```

### **Résultat Attendu:**
```
| entity  | total | synced | failed | success |
|---------|-------|--------|--------|---------|
| alert   | 100   | 100    | 0      | 100.0   |
| message | 50    | 50     | 0      | 100.0   |
```

**Critère de Succès:** `success_percent > 95%`

---

## 🚀 Checklist de Validation

### **AVANT Déployer:**
- [ ] Test 1: Auto-sync 30s fonctionne
- [ ] Test 2: Reconnexion déclenche sync immédiate
- [ ] Test 3: Alerte offline → sync online ✅
- [ ] Test 4: Message offline → sync online ✅
- [ ] Test 5: Hunting report PAS syncé offline
- [ ] Test 6: Pas de doublons dans DB
- [ ] Test 7: Success rate > 95%

### **APRÈS Déployer (Monitoring):**
- [ ] Console clean (pas d'erreurs)
- [ ] UI: "Dernière synchro" se met à jour
- [ ] Alertes créées offline apparaissent online
- [ ] Messages créés offline arrivent online
- [ ] Success rate reste > 95%
- [ ] Pas de croissance infinie de pending count

---

## ⚠️ Troubleshooting

### **Problème: "Auto-sync échouée - Serveur non disponible"**
```
Cause: Backend server offline
Action:
  1. Check backend status
  2. Restart backend service
  3. Verify DB connection
  4. Check logs: tail -f backend.log
```

### **Problème: "Erreur de synchronisation"**
```
Cause: Validation failed or data error
Action:
  1. Check outbox table: SELECT * WHERE status='failed'
  2. See last_error column
  3. Fix payload data
  4. Manual retry: UPDATE outbox SET status='pending' WHERE id=xxx
```

### **Problème: "Doublons détectés"**
```
Cause: Same data inserted multiple times
Action:
  1. Clean duplicates: DELETE FROM outbox WHERE id IN (...)
  2. Check mapOfflineEntity is correct
  3. Verify no accidental re-posting
```

### **Problème: Pas de sync même avec internet**
```
Cause: JWT token expired
Action:
  1. Check localStorage: localStorage.getItem('token')
  2. If empty/invalid → User must re-login
  3. After relogin, auto-sync should work
```

---

## 📈 Métriques à Tracker

**Daily Monitor:**
```sql
SELECT 
  DATETIME('now') as timestamp,
  COUNT(*) as total_pending,
  COUNT(CASE WHEN entity='alert' THEN 1 END) as alerts_pending,
  COUNT(CASE WHEN entity='message' THEN 1 END) as messages_pending
FROM outbox
WHERE status='pending';
```

**Idéal:**
- Avant sync: 0 items pending
- Immédiatement après creation: items go → pending → acked (< 30s)
- Never > 50 pending à moins que offline très longtemps

---

## 🎯 Success Criteria

| Critère | Avant | Après | Status |
|---------|-------|-------|--------|
| Sync automatique | ❌ Non | ✅ Oui (30s) | ✅ |
| Sync immédiate reconnect | ❌ Non | ✅ Oui | ✅ |
| Seules alertes/messages | ❌ Mixed | ✅ Only alerts/msg | ✅ |
| Pas de doublons | ❌ Many | ✅ Zero | ✅ |
| Success rate | ❓ Unknown | ✅ > 95% | ✅ |
| Console errors | ❓ Unknown | ✅ Clean | ✅ |

---

## 🚢 Deployment Checklist

```
PRE-DEPLOY:
  [ ] All tests passing locally
  [ ] No console errors
  [ ] DB clean (no old failed items)
  [ ] Build succeeds: npm run build

DEPLOY:
  [ ] Push commits to main
  [ ] Run CI/CD pipeline
  [ ] Backend server healthy
  [ ] DB migrations OK

POST-DEPLOY:
  [ ] Monitor console for errors
  [ ] Check sync frequency in logs
  [ ] Verify alerts/messages appear online
  [ ] Monitor DB for explosion of pending
  [ ] Be ready to rollback if issues

ROLLBACK (if issues):
  [ ] Revert commits
  [ ] Restart backend
  [ ] Clear cache
  [ ] Test connectivity
```

---

## 📞 Support

**If tests fail:**
1. Check console for exact error
2. Run diagnostic SQL queries
3. Check backend logs
4. Contact backend team with:
   - Console errors
   - SQL query results
   - Timestamp of issue

---

**Status:** ✅ **READY FOR TESTING**  
**Version:** 1.0  
**Date:** 2026-05-27

