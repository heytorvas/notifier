import { fireEvent, render } from '@testing-library/react-native';

import { RoleScreen } from './RoleScreen';

describe('RoleScreen', () => {
  it('reports the selected role without naming a device class', async () => {
    const onChoose = jest.fn();
    const screen = await render(<RoleScreen onChoose={onChoose} />);

    expect(screen.getByText('Notifier')).toBeTruthy();
    await fireEvent.press(screen.getByText('Send'));
    await fireEvent.press(screen.getByText('Receive'));

    expect(onChoose).toHaveBeenNthCalledWith(1, 'transmitter');
    expect(onChoose).toHaveBeenNthCalledWith(2, 'receiver');
    expect(screen.queryByText(/tablet|phone|watch|Samsung/i)).toBeNull();
  });
});
