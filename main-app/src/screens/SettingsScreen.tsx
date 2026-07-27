import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { ZenToggle } from '../components/ZenToggle';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { registerForPushNotificationsAsync } from '../lib/push';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import type { Profile } from '../types/api';
import { ScreenProps } from '../navigation/types';

export function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const t = useTheme();
  const { signOut } = useAuth();
  const keyboardInset = useKeyboardInset();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    api
      .getMe()
      .then((p) => alive && setProfile(p))
      .catch((e: unknown) => alive && setNotice(friendlyError(e, 'Couldn’t load your profile.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(load);

  const patch = async (body: Parameters<typeof api.updateMe>[0], optimistic?: Partial<Profile>) => {
    if (optimistic && profile) setProfile({ ...profile, ...optimistic });
    try {
      setProfile(await api.updateMe(body));
    } catch (e) {
      setNotice(friendlyError(e, 'Couldn’t save that change.'));
      load();
    }
  };

  const saveName = () => {
    setEditingName(false);
    const name = nameInput.trim();
    if (name.length > 1 && name !== profile?.name) patch({ name }, { name });
  };

  const toggleNotifications = async (next: boolean) => {
    if (!next) {
      patch({ notificationsEnabled: false }, { notificationsEnabled: false });
      return;
    }
    // Turning notifications on: also grab this device's push token, if available.
    const token = await registerForPushNotificationsAsync().catch(() => null);
    patch(
      { notificationsEnabled: true, ...(token ? { expoPushToken: token } : {}) },
      { notificationsEnabled: true },
    );
  };

  const connectCalendar = async () => {
    try {
      const { url } = await api.googleConnectUrl();
      Linking.openURL(url);
    } catch (e) {
      const err = e as ApiError;
      setNotice(
        err.notConfigured
          ? 'Google Calendar isn’t set up on the server yet.'
          : friendlyError(e, 'Couldn’t start the Google connection.'),
      );
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all of your events. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteAccount();
            } catch {
              /* fall through to sign out regardless */
            }
            await signOut();
          },
        },
      ],
    );
  };

  const reportBug = async () => {
    const to = 'miravvaitha@gmail.com,shaurya@kapoor.com';
    const url = `mailto:${to}?subject=${encodeURIComponent('Zenemic bug report')}`;
    try {
      await Linking.openURL(url);
    } catch {
    }
  };

  const initials = (profile?.name ?? '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const since = profile ? new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase() : '';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="SETTINGS" onBack={() => navigation.goBack()} showMenu={false} />
      {loading && !profile ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={22} borderWidth={2} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <Section paddingTop={28} gap={28}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: RADIUS.lg, backgroundColor: t.surface2, borderWidth: 0.5, borderColor: t.hairline, alignItems: 'center', justifyContent: 'center' }}>
                <ZenText style={{ fontFamily: FONTS.monoMedium, fontSize: 20, color: t.fg, letterSpacing: 1 }}>{initials || '··'}</ZenText>
              </View>
              <View style={{ flex: 1 }}>
                <ZenText variant="h2" style={{ fontSize: 19 }}>{profile?.name ?? '—'}</ZenText>
                <ZenText variant="mark" tone="fg3" style={{ marginTop: 4 }}>{since ? `SINCE ${since}` : 'MEMBER'}</ZenText>
              </View>
            </View>

            <View>
              <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 4 }}>ACCOUNT</ZenText>

              {/* Name (editable) */}
              <Row label="Name" isLast={false} onPress={() => { setNameInput(profile?.name ?? ''); setEditingName(true); }}>
                {editingName ? (
                  <TextInput
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    onBlur={saveName}
                    onSubmitEditing={saveName}
                    style={{ minWidth: 140, textAlign: 'right', fontSize: 14, color: t.fg, paddingVertical: 2 }}
                  />
                ) : (
                  <Value text={profile?.name ?? '—'} />
                )}
              </Row>

              <Row label="Email" isLast={false}>
                <Value text={profile?.email ?? '—'} />
              </Row>

              <Row label="Keyboard status" isLast={false} onPress={() => navigation.navigate('Keyboard')}>
                <Value text="Set up ›" accent />
              </Row>

              <Row label="Calendar" isLast={false} onPress={profile?.googleCalendarConnected ? undefined : connectCalendar}>
                <Value text={profile?.googleCalendarConnected ? 'Google · Synced' : 'Connect ›'} accent={!profile?.googleCalendarConnected} />
              </Row>

              <Row label="Notifications" isLast>
                <ZenToggle on={!!profile?.notificationsEnabled} onChange={toggleNotifications} />
              </Row>
            </View>

            {notice ? <ZenText variant="body" tone="fg2">{notice}</ZenText> : null}

            <ZenButton label="Log out" variant="ghost" onPress={() => signOut()} />
            <ZenButton label="Delete account" variant="danger" onPress={confirmDelete} />

            <View style={{ gap: 8, marginTop: 4 }}>
              <ZenText variant="eyebrow" tone="fg3">FOUND A BUG?</ZenText>
              <ZenText variant="body" tone="fg2">
                Spotted something broken or have feedback? Tap to email us — we’d love to hear it.
              </ZenText>
              <Pressable onPress={reportBug} hitSlop={8}>
                <ZenText style={{ fontFamily: FONTS.monoMedium, fontSize: 13, letterSpacing: 0.3, color: t.accent }}>
                  miravvaitha@gmail.com  ·  shaurya@kapoor.com  ›
                </ZenText>
              </Pressable>
            </View>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, children, onPress, isLast }: { label: string; children: React.ReactNode; onPress?: () => void; isLast: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: t.hairline,
        gap: 12,
      }}
    >
      <ZenText style={{ flex: 1, fontSize: 15, color: t.fg }}>{label}</ZenText>
      {children}
    </Pressable>
  );
}

function Value({ text, accent }: { text: string; accent?: boolean }) {
  const t = useTheme();
  return (
    <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.47, textTransform: 'uppercase', color: accent ? t.accent : t.fg3 }}>
      {text}
    </ZenText>
  );
}
