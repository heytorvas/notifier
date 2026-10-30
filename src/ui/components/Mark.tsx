import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { AppText } from './AppText';

const source = require('../../../assets/icon.png');

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function Mark({ size = 28, style }: Props) {
  const radius = Math.round(size * 0.22);
  return (
    <Image
      accessible={false}
      source={source}
      style={[{ borderRadius: radius, height: size, width: size }, style]}
    />
  );
}

export function Wordmark({ size = 64 }: { size?: number }) {
  return (
    <View style={styles.wordmark}>
      <Mark size={size} />
      <AppText weight="medium" style={styles.name}>
        Notifier
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    alignItems: 'center',
    gap: 12,
  },
  name: {
    fontSize: 28,
    lineHeight: 34,
  },
});
