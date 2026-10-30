import { formatDeviceName, orderInstalledApps, pairingFingerprint } from './devices';

const apps = [
  { name: 'Mail', packageName: 'com.example.mail' },
  { name: 'Bank', packageName: 'com.example.bank' },
  { name: 'Calculator', packageName: 'com.example.calculator' },
];

describe('orderInstalledApps', () => {
  it('places selected apps ahead of the alphabetical remainder', () => {
    expect(orderInstalledApps(apps, new Set(['com.example.mail']), '').map((app) => app.name)).toEqual([
      'Mail',
      'Bank',
      'Calculator',
    ]);
  });

  it('keeps selected matches first while searching by package name', () => {
    expect(
      orderInstalledApps(apps, new Set(['com.example.calculator']), 'example').map((app) => app.name),
    ).toEqual(['Calculator', 'Bank', 'Mail']);
  });
});

describe('formatDeviceName', () => {
  it('shows the reported brand and model without repeating the brand', () => {
    expect(formatDeviceName('samsung', 'SM-X510')).toBe('Samsung SM-X510');
    expect(formatDeviceName('Google', 'Pixel 8')).toBe('Google Pixel 8');
    expect(formatDeviceName('samsung', 'Samsung Galaxy')).toBe('Samsung Galaxy');
  });
});

describe('pairingFingerprint', () => {
  it('uses the end of the inbox id instead of the raw secret', () => {
    const code = JSON.stringify({
      version: 1,
      inboxId: 'd9428888-122b-4e2d-8f48-0990c9f249e5',
      pairingToken: 'secret',
      key: 'secret',
    });
    expect(pairingFingerprint(code)).toBe('F249E5');
    expect(pairingFingerprint('not-json')).toBeNull();
  });
});
