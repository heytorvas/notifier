import { readEnvironment } from './environment';

describe('readEnvironment', () => {
  it('returns complete configuration', () => {
    expect(
      readEnvironment({
        relayUrl: 'https://relay.example.test',
        applicationId: 'app-id',
        apiKey: 'api-key',
        projectId: 'project-id',
        senderId: 'sender-id',
      }),
    ).toEqual({
      relayUrl: 'https://relay.example.test',
      firebase: {
        applicationId: 'app-id',
        apiKey: 'api-key',
        projectId: 'project-id',
        senderId: 'sender-id',
      },
    });
  });

  it('reports every missing value', () => {
    expect(() =>
      readEnvironment({
        applicationId: 'app-id',
        projectId: 'project-id',
        senderId: 'sender-id',
      }),
    ).toThrow(
      'Missing app configuration: EXPO_PUBLIC_RELAY_URL, EXPO_PUBLIC_FIREBASE_API_KEY',
    );
  });
});
