import { fireEvent, render } from '@testing-library/react-native';

import { DashboardScreen } from './DashboardScreen';

jest.mock('../../infrastructure/notifierGateway', () => ({
  notifierGateway: {
    getAppIcon: jest.fn().mockResolvedValue('data:image/png;base64,icon'),
  },
}));

const callbacks = {
  alerts: [],
  diagnostics: [],
  listenerConnected: true,
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

  it('does not ask for access again when the listener permission is already granted', async () => {
    const screen = await render(
      <DashboardScreen
        {...callbacks}
        apps={[]}
        listenerConnected={false}
        notificationAccess
        pairedAt={null}
        peer={null}
        role="transmitter"
        sensitiveContentLimited={false}
      />,
    );

    expect(screen.getByText('Reconnecting')).toBeTruthy();
    expect(
      screen.getByText(
        'Android already allows notification access. If this stays, turn Notifier off and on in notification access.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Allow access')).toBeNull();
    fireEvent.press(screen.getByLabelText('Notification access'));
    expect(callbacks.onFixPermission).toHaveBeenCalledTimes(1);
  });

  it('shows newest alerts and activity inside the dashboard', async () => {
    const screen = await render(
      <DashboardScreen
        {...callbacks}
        apps={[]}
        alerts={[
          {
            id: 'older',
            at: 1_700_000_000_000,
            direction: 'out',
            appName: 'Older Bank',
            packageName: 'com.older',
            title: 'Older payment',
            text: 'First transfer',
            status: 'delivered',
            detail: '',
          },
          {
            id: 'newer',
            at: 1_700_000_100_000,
            direction: 'out',
            appName: 'Newer Bank',
            packageName: 'com.newer',
            title: 'Newer payment',
            text: 'Second transfer',
            status: 'failed',
            detail: 'Relay rejected the alert',
          },
        ]}
        diagnostics={[{ id: 'event', at: 1_700_000_100_000, message: 'Listener disconnected' }]}
        notificationAccess
        pairedAt={null}
        peer={null}
        role="transmitter"
        sensitiveContentLimited={false}
      />,
    );

    const titles = screen.getAllByText(/payment/).map((node) => node.props.children);
    expect(titles).toEqual(['Newer payment', 'Older payment']);
    expect(screen.getByText('Second transfer').props.numberOfLines).toBe(3);
    expect(screen.getByText(/Failed · Relay rejected the alert/)).toBeTruthy();
    expect(screen.getByText('Listener disconnected')).toBeTruthy();
  });
});
