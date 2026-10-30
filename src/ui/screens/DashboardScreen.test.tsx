import { fireEvent, render } from '@testing-library/react-native';

import { DashboardScreen } from './DashboardScreen';

jest.mock('../../infrastructure/notifierGateway', () => ({
  notifierGateway: {
    getAppIcon: jest.fn().mockResolvedValue('data:image/png;base64,icon'),
  },
}));

const callbacks = {
  onEditApps: jest.fn(),
  onFixPermission: jest.fn(),
  onReset: jest.fn(),
};

const peer = { brand: 'Google', model: 'Pixel 8' };
const apps = [{ packageName: 'com.example.bank', name: 'Example Bank' }];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DashboardScreen', () => {
  it('shows connection, the other device, and transmitting apps', async () => {
    const screen = await render(
      <DashboardScreen
        {...callbacks}
        apps={apps}
        notificationAccess
        pairedAt={1_700_000_000_000}
        peer={peer}
        role="receiver"
        sensitiveContentLimited={false}
      />,
    );

    expect(screen.getByText('Notifier')).toBeTruthy();
    expect(screen.getByText('Receiving')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Google Pixel 8')).toBeTruthy();
    expect(screen.getByText('Example Bank')).toBeTruthy();
    expect(screen.queryByLabelText('Edit apps')).toBeNull();
  });

  it('mentions Android redaction without a settings lecture', async () => {
    const screen = await render(
      <DashboardScreen
        {...callbacks}
        apps={[]}
        notificationAccess
        pairedAt={null}
        peer={null}
        role="transmitter"
        sensitiveContentLimited
      />,
    );

    expect(screen.getByText('Android may redact some alerts.')).toBeTruthy();
    expect(screen.getByLabelText('Edit apps')).toBeTruthy();
  });

  it('offers permission recovery when delivery is unhealthy', async () => {
    const screen = await render(
      <DashboardScreen
        {...callbacks}
        apps={[]}
        notificationAccess={false}
        pairedAt={null}
        peer={null}
        role="receiver"
        sensitiveContentLimited={false}
      />,
    );

    await fireEvent.press(screen.getByText('Allow access'));
    expect(callbacks.onFixPermission).toHaveBeenCalledTimes(1);
  });
});
