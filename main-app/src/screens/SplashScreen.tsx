import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '../theme';
import { ZenText } from '../components/ZenText';
import { Spinner } from '../components/Spinner';

// Shown only while the auth session is being restored. AppNavigator swaps to the
// auth or app stack automatically once loading completes — no navigation here.
export function SplashScreen() {
  const t = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Image
          source={require('../../assets/zenemic-orb.png')}
          style={{ width: 88, height: 88 }}
          resizeMode="contain"
        />
        <ZenText variant="wordmarkBig" tone="fg">ZENEMIC</ZenText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 48 }}>
        <Spinner size={10} borderWidth={1} />
        <ZenText variant="mark" tone="fg3">Starting…</ZenText>
      </View>
    </View>
  );
}
