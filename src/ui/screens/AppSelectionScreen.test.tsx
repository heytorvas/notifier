import { fireEvent, render } from '@testing-library/react-native';

import { AppSelectionScreen } from './AppSelectionScreen';

jest.mock('../../infrastructure/notifierGateway', () => ({
  notifierGateway: {
    getAppIcon: jest.fn().mockResolvedValue('data:image/png;base64,icon'),
    openNotificationAccessSettings: jest.fn(),
  },
}));

const apps = [
  { name: 'Example Bank', packageName: 'com.example.bank' },
  { name: 'Calculator', packageName: 'com.example.calculator' },
];

describe('AppSelectionScreen', () => {
  it('lists selected apps before the rest', async () => {
    const screen = await render(
      <AppSelectionScreen
        apps={[
          { name: 'Alpha', packageName: 'com.example.alpha' },
          { name: 'Zulu', packageName: 'com.example.zulu' },
        ]}
        initialSelection={['com.example.zulu']}
        notificationAccess
        onSave={jest.fn()}
        saving={false}
      />,
    );

    const names = screen.getAllByText(/Alpha|Zulu/).map((node) => node.props.children);
    expect(names).toEqual(['Zulu', 'Alpha']);
  });

  it('filters, selects, and saves package names rather than display labels', async () => {
    const onSave = jest.fn();
    const screen = await render(
      <AppSelectionScreen
        apps={apps}
        initialSelection={[]}
        notificationAccess
        onSave={onSave}
        saving={false}
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Search installed apps'), 'bank');
    expect(screen.getByText('Example Bank')).toBeTruthy();
    expect(screen.queryByText('Calculator')).toBeNull();
    await fireEvent.press(screen.getByText('Example Bank'));
    await fireEvent.press(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith(['com.example.bank']);
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('blocks saving until notification-listener access is active', async () => {
    const screen = await render(
      <AppSelectionScreen
        apps={apps}
        initialSelection={['com.example.bank']}
        notificationAccess={false}
        onSave={jest.fn()}
        saving={false}
      />,
    );

    expect(screen.getByText('Notification access')).toBeTruthy();
    expect(screen.getByText('Save').parent?.props.accessibilityState.disabled).toBe(true);
  });
});
