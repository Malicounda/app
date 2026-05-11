import { App } from './server';
import registerRoutesFunction from './routes'; // Pointe vers server/src/routes/index.ts

export const app = new App(registerRoutesFunction);

// Export pour les tests
if (process.env.NODE_ENV !== 'production') {
    module.exports = app;
}