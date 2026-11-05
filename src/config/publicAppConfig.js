const PLACEHOLDER_EAS_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const PLACEHOLDER_EXPO_OWNER = 'your-expo-account';

function present(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || undefined;
}

function resolveExpoIdentity(source = {}) {
  const projectId = present(source.projectId) ?? PLACEHOLDER_EAS_PROJECT_ID;
  return {
    projectId,
    updatesUrl: present(source.updatesUrl) ?? `https://u.expo.dev/${projectId}`,
    owner: present(source.owner) ?? PLACEHOLDER_EXPO_OWNER,
  };
}

module.exports = {
  PLACEHOLDER_EAS_PROJECT_ID,
  PLACEHOLDER_EXPO_OWNER,
  resolveExpoIdentity,
};
