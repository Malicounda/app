import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eforets.alerte',
  appName: 'Alerte',
  webDir: 'client/dist',
  server: {
    // Comme la sauvegarde Alerte.apk : WebView → login Alerte uniquement (pas le bundle local complet)
    // url: 'https://eforets.pages.dev/alerte-login?isApk=true',
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: ['eforets.pages.dev', 'malicounda-api.onrender.com'],
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
      launchAutoHide: true,
      backgroundColor: '#114b26',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    Badge: {
      persist: true,
      autoClear: false,
    },
    LocalNotifications: {
      smallIcon: "ic_launcher_foreground",
      iconColor: "#114B26",
    },
  },
};

export default config;
