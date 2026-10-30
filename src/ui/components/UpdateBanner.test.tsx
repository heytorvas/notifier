import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Updates from 'expo-updates';

import { UpdateBanner } from './UpdateBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

describe('UpdateBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stays hidden until an update exists', async () => {
    jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: false } as never);
    const screen = await render(<UpdateBanner />);
    await waitFor(() => expect(Updates.checkForUpdateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Update available')).toBeNull();
  });

  it('downloads and reloads when the banner is pressed', async () => {
    jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: true } as never);
    jest.mocked(Updates.fetchUpdateAsync).mockResolvedValue({} as never);
    jest.mocked(Updates.reloadAsync).mockResolvedValue(undefined);
    const screen = await render(<UpdateBanner />);
    await waitFor(() => expect(screen.getByText('Update available')).toBeTruthy());
    await fireEvent.press(screen.getByText('Update available'));
    await waitFor(() => expect(Updates.reloadAsync).toHaveBeenCalledTimes(1));
  });
});
