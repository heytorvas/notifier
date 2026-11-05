import appConfig from '../../app.json';

describe('Android app configuration', () => {
  it('builds Android and a web design preview, and disables backup of pairing state', () => {
    expect(appConfig.expo.platforms).toEqual(['android', 'web']);
    expect(appConfig.expo.android.allowBackup).toBe(false);
  });

  it('requests no microphone permission for QR scanning', () => {
    const cameraPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin));
    expect(cameraPlugin).toEqual([
      'expo-camera',
      {
        cameraPermission: 'Allow Notifier to scan a pairing QR code.',
        recordAudioAndroid: false,
      },
    ]);
  });

  it('does not request broad installed-package visibility or duplicate plugins', () => {
    expect(appConfig.expo.android.permissions).not.toContain(
      'android.permission.QUERY_ALL_PACKAGES',
    );
    const pluginNames = appConfig.expo.plugins.map((plugin) =>
      Array.isArray(plugin) ? plugin[0] : plugin,
    );
    expect(new Set(pluginNames).size).toBe(pluginNames.length);
  });

  it('blocks unrelated storage, overlay, and microphone permissions', () => {
    expect(appConfig.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
      ]),
    );
  });

  it('declares a UI style implemented by the fixed palette', () => {
    expect(appConfig.expo.userInterfaceStyle).toBe('dark');
    expect(appConfig.expo.backgroundColor).toBe('#000000');
    expect(appConfig.expo.android.backgroundColor).toBe('#000000');
  });

  it('ships an ARM release that can update JavaScript without a new install', () => {
    expect(appConfig.expo.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(appConfig.expo.updates.url).toBe(
      'https://u.expo.dev/00000000-0000-0000-0000-000000000000',
    );
    expect(appConfig.expo.extra.eas.projectId).toBe('00000000-0000-0000-0000-000000000000');
    expect(appConfig.expo.owner).toBe('your-expo-account');
    const buildProperties = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );
    expect(buildProperties?.[1]).toMatchObject({
      android: {
        buildArchs: ['armeabi-v7a', 'arm64-v8a'],
        useLegacyPackaging: true,
        enableBundleCompression: true,
      },
    });
  });
});
