import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { ZenToggle } from '../components/ZenToggle';
import { ScreenProps } from '../navigation/types';

type Row = { label: string; value?: string; accent?: boolean; toggle?: boolean };

const ROWS: Row[] = [
  { label: 'Name', value: 'Eve Lambert' },
  { label: 'Email', value: 'eve@email.com' },
  { label: 'Keyboard status', value: 'Installed', accent: true },
  { label: 'Default budget split', value: 'Even' },
  { label: 'Calendar', value: 'Google · Synced' },
  { label: 'Notifications', toggle: true },
];

export function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const t = useTheme();

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all of your events. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            navigation.reset({ index: 0, routes: [{ name: 'SignUp' }] }),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ZenChrome label="SETTINGS" onBack={() => navigation.goBack()} showMenu={false} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Section paddingTop={28} gap={28}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: RADIUS.lg,
                backgroundColor: t.surface2,
                borderWidth: 0.5,
                borderColor: t.hairline,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ZenText style={{ fontFamily: FONTS.monoMedium, fontSize: 20, color: t.fg, letterSpacing: 1 }}>
                EL
              </ZenText>
            </View>
            <View>
              <ZenText variant="h2" style={{ fontSize: 19 }}>Eve Lambert</ZenText>
              <ZenText variant="mark" tone="fg3" style={{ marginTop: 4 }}>SINCE MAR 2026 · 14 EVENTS</ZenText>
            </View>
          </View>

          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 4 }}>ACCOUNT</ZenText>
            <View>
              {ROWS.map((r, i) => (
                <View
                  key={r.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 16,
                    borderBottomWidth: i < ROWS.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.hairline,
                    gap: 12,
                  }}
                >
                  <ZenText style={{ flex: 1, fontSize: 15, color: t.fg }}>{r.label}</ZenText>
                  {r.toggle ? (
                    <ZenToggle defaultOn />
                  ) : (
                    <ZenText
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 11,
                        letterSpacing: 1.47,
                        textTransform: 'uppercase',
                        color: r.accent ? t.accent : t.fg3,
                      }}
                    >
                      {r.value}
                    </ZenText>
                  )}
                </View>
              ))}
            </View>
          </View>

          <ZenButton
            label="Log out"
            variant="ghost"
            onPress={() =>
              navigation.reset({ index: 0, routes: [{ name: 'SignUp' }] })
            }
          />

          <ZenButton label="Delete account" variant="danger" onPress={confirmDeleteAccount} />
        </Section>
      </ScrollView>
    </View>
  );
}
