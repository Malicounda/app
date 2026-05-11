// Fonction de journalisation
const log = (message: string, source: string = 'app'): void => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${source}] ${message}`);
};

// Fonction pour les erreurs
const error = (message: string, error?: unknown, source: string = 'app'): void => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${source}] ${message}`);
  if (error instanceof Error) {
    console.error(`[${timestamp}] [${source}] ${error.stack || error.message}`);
  } else if (error) {
    console.error(`[${timestamp}] [${source}]`, error);
  }
};

export { log, error };
