import { fireEvent, render } from '@testing-library/react-native';

import { DesignPreview } from './DesignPreview';

jest.mock('expo-camera', () => ({
  CameraView: () => {
    throw new Error('camera opened');
  },
  useCameraPermissions: () => {
    throw new Error('camera permission requested');
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(true),
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

jest.mock('../../infrastructure/notifierGateway', () => ({
  notifierGateway: {
    getAppIcon: jest.fn().mockRejectedValue(new Error('design preview')),
    openNotificationAccessSettings: jest.fn(),
  },
}));

describe('DesignPreview', () => {
  it('walks the screen layouts without opening the camera', async () => {
    const screen = await render(<DesignPreview />);

    expect(screen.getByText('Notifier')).toBeTruthy();
    expect(screen.getByText('Send')).toBeTruthy();

    await fireEvent.press(screen.getByText('Send'));
    expect(screen.getByText('Allow camera')).toBeTruthy();
    expect(screen.getByText('Paste')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('Receive')).toBeTruthy();

    await fireEvent.press(screen.getByText('Receive'));
    expect(screen.getByText('Copy')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Receiver'));
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Google Pixel 8')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Apps'));
    expect(screen.getByText('Example Bank')).toBeTruthy();

    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getAllByText('Example Bank').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Edit apps')).toBeTruthy();

    await fireEvent.press(screen.getByText('Unpair'));
    expect(screen.getByText('Send')).toBeTruthy();
  });
});
