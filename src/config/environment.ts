import type { FirebaseConfig } from '../../modules/notifier-native/src/NotifierNativeModule';

export type AppEnvironment = {
  relayUrl: string;
  firebase: FirebaseConfig;
};

type EnvironmentSource = {
  relayUrl?: string;
  applicationId?: string;
  apiKey?: string;
  projectId?: string;
  senderId?: string;
};

export function readEnvironment(
  source: EnvironmentSource = {
    relayUrl: process.env.EXPO_PUBLIC_RELAY_URL,
    applicationId: process.env.EXPO_PUBLIC_FIREBASE_APPLICATION_ID,
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    senderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  },
): AppEnvironment {
  const environment = {
    relayUrl: source.relayUrl,
    firebase: {
      applicationId: source.applicationId,
      apiKey: source.apiKey,
      projectId: source.projectId,
      senderId: source.senderId,
    },
  };

  const missing = [
    ['EXPO_PUBLIC_RELAY_URL', environment.relayUrl],
    ['EXPO_PUBLIC_FIREBASE_APPLICATION_ID', environment.firebase.applicationId],
    ['EXPO_PUBLIC_FIREBASE_API_KEY', environment.firebase.apiKey],
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', environment.firebase.projectId],
    ['EXPO_PUBLIC_FIREBASE_SENDER_ID', environment.firebase.senderId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing app configuration: ${missing.join(', ')}`);
  }

  return environment as AppEnvironment;
}
