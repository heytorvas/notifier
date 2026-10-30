import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { notifierGateway } from '../../infrastructure/notifierGateway';
import { colors, radius } from '../theme';

type Props = {
  packageName: string;
  size?: number;
};

export function AppIcon({ packageName, size = 36 }: Props) {
  const [icon, setIcon] = useState<string>();

  useEffect(() => {
    let active = true;
    void notifierGateway
      .getAppIcon(packageName)
      .then((value) => {
        if (active) setIcon(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [packageName]);

  if (!icon) return <View style={[styles.placeholder, { borderRadius: radius.sm, height: size, width: size }]} />;
  return <Image source={{ uri: icon }} style={{ borderRadius: radius.sm, height: size, width: size }} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.gray100,
  },
});
