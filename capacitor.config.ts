import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eforets.alerte',
  appName: 'Alerte',
  webDir: 'client/dist',
  server: {
    // L'APK charge directement l'URL de production
    url: 'https://eforets.pages.dev/alerte-login?isApk=true',
    cleartext: false,
    allowNavigation: ['eforets.pages.dev'],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#114b26',
    appendUserAgent: 'AlerteAPK',
  },
  plugins: {
    App: {
      // Intercepté manuellement dans le code pour bloquer le retour système
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#114b26',
      showSpinner: false,
    },
  },
};

export default config;
