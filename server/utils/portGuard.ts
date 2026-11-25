import { execFileSync } from 'child_process';
import net from 'net';
import { log } from './logger.js';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Vérifie si un port TCP est libre en tentant une écoute temporaire.
 */
function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();

    tester.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Autre erreur (ex: EACCES) : on laisse le vrai server.listen la remonter proprement
        resolve(true);
      }
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, host);
  });
}

/**
 * Récupère les PID des processus en écoute (LISTENING) sur un port TCP donné.
 */
function findListeningPids(port: number): number[] {
  const pids = new Set<number>();
  const excludedPids = new Set<number>([0, 1, 4, process.pid, process.ppid]);

  if (process.platform === 'win32') {
    // Méthode 1 (recommandée) : PowerShell Get-NetTCPConnection (indépendant de la langue Windows et de l'encodage)
    try {
      const psOutput = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
        ],
        {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 4000,
        }
      );

      for (const rawLine of psOutput.split(/\r?\n/)) {
        const pid = Number.parseInt(rawLine.trim(), 10);
        if (Number.isInteger(pid) && pid > 4 && !excludedPids.has(pid)) {
          pids.add(pid);
        }
      }
    } catch {
      // Fallback vers netstat ci-dessous
    }

    // Méthode 2 (fallback) : netstat -ano (gère LISTENING et ÉCOUTE même avec encodage CP850)
    if (pids.size === 0) {
      try {
        const output = execFileSync('netstat', ['-ano'], {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 4000,
        });

        const portSuffix = `:${port}`;
        for (const rawLine of output.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line.startsWith('TCP')) continue;

          const parts = line.split(/\s+/);
          // Format attendu: TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING/ÉCOUTE  12345
          if (parts.length < 5) continue;

          const localAddr = parts[1];
          const state = parts[3];
          const pid = Number.parseInt(parts[4], 10);

          if (
            localAddr.endsWith(portSuffix) &&
            /^(LISTENING|.*COUTE)$/i.test(state) &&
            Number.isInteger(pid) &&
            pid > 4 &&
            !excludedPids.has(pid)
          ) {
            pids.add(pid);
          }
        }
      } catch {
        // Aucun processus trouvé ou outil indisponible
      }
    }
  } else {
    try {
      const output = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      });

      for (const rawLine of output.split(/\r?\n/)) {
        const pid = Number.parseInt(rawLine.trim(), 10);
        if (Number.isInteger(pid) && pid > 1 && !excludedPids.has(pid)) {
          pids.add(pid);
        }
      }
    } catch {
      // Aucun processus trouvé ou lsof indisponible
    }
  }

  return Array.from(pids);
}

/**
 * Termine un processus par son PID et retourne le résultat + un éventuel message d'erreur.
 */
function terminatePid(pid: number): { ok: boolean; error?: string } {
  if (process.platform === 'win32') {
    // 1. Essayer l'API native Node (TerminateProcess sur Windows)
    try {
      process.kill(pid, 'SIGKILL');
      return { ok: true };
    } catch (err: any) {
      if (err?.code === 'ESRCH') {
        return { ok: true }; // Déjà terminé
      }
    }

    // 2. Fallback taskkill /F (sans /T d'abord pour éviter les erreurs d'arbre partiel)
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/F'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 4000,
      });
      return { ok: true };
    } catch (err: any) {
      // 3. Dernier essai avec PowerShell Stop-Process
      try {
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', `Stop-Process -Id ${pid} -Force -ErrorAction Stop`],
          {
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 4000,
          }
        );
        return { ok: true };
      } catch (psErr: any) {
        const msg = psErr?.stderr?.toString()?.trim() || err?.stderr?.toString()?.trim() || err?.message || 'Erreur inconnue';
        return { ok: false, error: msg };
      }
    }
  }

  try {
    process.kill(pid, 'SIGTERM');
    return { ok: true };
  } catch (err: any) {
    if (err?.code === 'ESRCH') {
      return { ok: true };
    }
    return { ok: false, error: err?.message || 'Erreur inconnue' };
  }
}

/**
 * En développement uniquement (jamais en production), vérifie si le port est occupé
 * et ferme proprement l'ancien processus en écoute avant le démarrage du serveur.
 *
 * Peut être désactivé même en dev avec AUTO_FREE_PORT=false.
 */
export async function ensurePortAvailable(port: number, host: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (process.env.AUTO_FREE_PORT === 'false') {
    return;
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return;
  }

  const free = await isPortFree(port, host);
  if (free) {
    return;
  }

  log(`⚠️ Le port ${port} est déjà occupé (mode développement). Recherche du processus...`, 'server');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const pids = findListeningPids(port);
    if (pids.length === 0) {
      log(`⚠️ Impossible d'identifier le processus occupant le port ${port}.`, 'server');
      return;
    }

    log(`🔍 Processus détecté(s) sur le port ${port} : PID ${pids.join(', ')}`, 'server');

    for (const pid of pids) {
      const res = terminatePid(pid);
      if (res.ok) {
        log(`🧹 Ancien processus (PID ${pid}) arrêté sur le port ${port}.`, 'server');
      } else {
        log(`⚠️ Impossible d'arrêter le processus PID ${pid} sur le port ${port}: ${res.error}`, 'server');
      }
    }

    // Attendre que l'OS libère effectivement le socket (jusqu'à 3 secondes)
    const maxWaitMs = 3000;
    const intervalMs = 150;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      if (await isPortFree(port, host)) {
        log(`✅ Port ${port} libéré avec succès.`, 'server');
        return;
      }
      await delay(intervalMs);
    }
  }

  log(`⚠️ Le port ${port} semble toujours occupé après libération.`, 'server');
}
