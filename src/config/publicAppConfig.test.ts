import {
  PLACEHOLDER_EAS_PROJECT_ID,
  PLACEHOLDER_EXPO_OWNER,
  resolveExpoIdentity,
} from './publicAppConfig';

describe('resolveExpoIdentity', () => {
  it('uses placeholders when the deployment environment is absent', () => {
    expect(resolveExpoIdentity()).toEqual({
      projectId: PLACEHOLDER_EAS_PROJECT_ID,
      updatesUrl: `https://u.expo.dev/${PLACEHOLDER_EAS_PROJECT_ID}`,
      owner: PLACEHOLDER_EXPO_OWNER,
    });
  });

  it('uses the deployment environment without changing committed identifiers', () => {
    expect(resolveExpoIdentity({
      projectId: '11111111-2222-4333-8444-555555555555',
      updatesUrl: 'https://u.expo.dev/11111111-2222-4333-8444-555555555555',
      owner: 'example',
    })).toEqual({
      projectId: '11111111-2222-4333-8444-555555555555',
      updatesUrl: 'https://u.expo.dev/11111111-2222-4333-8444-555555555555',
      owner: 'example',
    });
  });
});
