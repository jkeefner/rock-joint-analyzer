import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.keefnermining.jointanalyzer',
  appName: 'Rock Joint Analyzer',
  webDir: 'build',
  server: {
    androidScheme: 'https'
  }
};

export default config;