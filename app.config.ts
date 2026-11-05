import appJson from './app.json';
import { resolveExpoIdentity } from './src/config/publicAppConfig.js';

const identity = resolveExpoIdentity({
  projectId: process.env.EAS_PROJECT_ID,
  updatesUrl: process.env.EXPO_PUBLIC_UPDATES_URL,
  owner: process.env.EXPO_OWNER,
});

export default {
  expo: {
    ...appJson.expo,
    owner: identity.owner,
    updates: {
      ...appJson.expo.updates,
      url: identity.updatesUrl,
    },
    extra: {
      ...appJson.expo.extra,
      eas: {
        ...appJson.expo.extra.eas,
        projectId: identity.projectId,
      },
    },
  },
};
