# SERVER TRUTH CONTRACT : SCoDi Offline-First

Ce document définit les obligations **STRICTES** du Backend pour garantir l'intégrité de l'architecture Offline-First SCoDi.
**Si le serveur ne respecte pas ce contrat, la base de données subira des pertes ou duplications de données silently.**

## 1. Idempotence Stricte (OBLIGATOIRE)

Le client génère et envoie un header HTTP `X-Idempotency-Key` pour chaque requête mutante (`POST`, `PUT`, `DELETE`).
Cette clé est générée à partir de : `UUID + SHA256(payload)`.

**Le Serveur DOIT :**
1. **Stocker** chaque `X-Idempotency-Key` traitée avec succès, associée à la réponse HTTP exacte renvoyée (Body + Status).
2. **Durée de vie (TTL)** : Conserver cette clé pendant au moins **72 heures**.
3. **Replay garanti** : Si une requête arrive avec une `X-Idempotency-Key` déjà connue, le serveur **NE DOIT PAS** exécuter la logique métier à nouveau. Il **DOIT** renvoyer instantanément la réponse mise en cache associée à cette clé.

> **Explication du risque évité (False Success State) :**
> Si le client envoie une alerte, que le serveur la traite, mais que la connexion 3G coupe avant la réponse HTTP 200...
> Le client croit que c'est un échec. Il rejouera la requête. 
> Sans déduplication par le serveur, la base de données aura un doublon parfait.

## 2. Chunked Upload API

Les pièces jointes volumineuses sont envoyées en morceaux (chunks) de 1 MB.

**Le Serveur DOIT implémenter `POST /api/attachments/chunk` :**
- **Paramètres attendus (FormData) :**
  - `uploadId` : L'identifiant unique de la session de téléchargement.
  - `chunkIndex` : L'index du morceau (commence à 0).
  - `totalChunks` : Le nombre total de morceaux attendus.
  - `chunk` : Le fichier binaire partiel.
  - `chunkHash` : **SHA-256 hex du chunk** calculé côté client avant envoi.
- **Vérification d'intégrité OBLIGATOIRE** : À réception du chunk, le serveur DOIT recalculer le SHA-256 du binaire reçu et le comparer au `chunkHash`. Si les hash ne correspondent pas → renvoyer **`422 Unprocessable Entity`**. Le client réessayera automatiquement.
- Le serveur doit réassembler les chunks côté disque ou S3 uniquement lorsque `chunkIndex == totalChunks - 1`.

## 3. Gestion de Conflits (Versionning Vectoriel)

Pour éviter d'écraser des données éditées simultanément sur le web et en offline sur un téléphone.

**Le Serveur DOIT :**
1. Comparer la version ou le timestamp de la ressource.
2. Si le client envoie une mise à jour d'une ressource (via `PUT`), et que la version du serveur est *plus récente* que la version que le client connaissait lorsqu'il a modifié la donnée.
3. Renvoyer **`409 Conflict`** (et non un 500 ou 400).
4. Le client gérera le 409 et le passera au Moteur de Réconciliation pour fusion ou écrasement forcé.
