import { render } from '@testing-library/react-native';

import { PairTransmitterScreen } from './PairTransmitterScreen';

jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CameraView: (props: object) => React.createElement(ReactNative.View, props),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn().mockResolvedValue(''),
}));

describe('PairTransmitterScreen', () => {
  it('shows a viewfinder over the camera so the code has a place to sit', async () => {
    const screen = await render(
      <PairTransmitterScreen loading={false} onCancel={() => undefined} onPair={async () => true} />,
    );

    expect(screen.getByLabelText('QR code viewfinder')).toBeTruthy();
    expect(screen.getByText('Place the code inside the frame, or paste it.')).toBeTruthy();
  });
});
