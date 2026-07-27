import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { ZenBrandBar } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenInput } from '../components/ZenInput';
import { ZenButton } from '../components/ZenButton';
import { useAuth } from '../lib/auth';
import { useKeyboardInset } from '../lib/useKeyboardInset';

function friendly(message: string): string {
  if (/should be different|same.*password/i.test(message)) {
    return 'That’s already your password. Choose a different one.';
  }
  if (/at least|too short|length/i.test(message)) return 'Password must be at least 6 characters.';
  if (/session|expired|jwt/i.test(message)) {
    return 'That reset link has expired. Request a new one from the login screen.';
  }
  return 'Couldn’t update your password. Request a new link and try again.';
}

/**
 * The final step of a password reset. Reached only via a reset deep link — the
 * navigator pins this screen while `recovery.active`, because the link creates a
 * real session and would otherwise drop the user straight into the app.
 */
export function ResetPasswordScreen() {
  const t = useTheme();
  const { recovery, updatePassword, cancelRecovery } = useAuth();
  const keyboardInset = useKeyboardInset();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwMatch = pw.length >= 6 && pw === pw2;
  const pwMismatch = pw2.length > 0 && pw !== pw2;
  const valid = pwMatch && !recovery.error;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await updatePassword(pw);
      // Success: the session is already live, so the navigator swaps to the app.
    } catch (e) {
      setError(friendly((e as Error).message));
    } finally {
      setLoading(false);
    }
  };

  // A dead link still lands here so we can explain, rather than failing silently.
  if (recovery.error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ZenBrandBar />
        <Section paddingTop={60} gap={28}>
          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>LINK EXPIRED</ZenText>
            <ZenText variant="h1">This link{'\n'}won't work.</ZenText>
            <ZenText variant="body" style={{ marginTop: 12 }}>{recovery.error}</ZenText>
          </View>
        </Section>
        <Anchor>
          <ZenButton label="Back to log in" variant="primary" onPress={() => void cancelRecovery()} />
        </Anchor>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenBrandBar />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section paddingTop={40} gap={28}>
          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>NEW PASSWORD</ZenText>
            <ZenText variant="h1">Set a new{'\n'}password.</ZenText>
            <ZenText variant="body" style={{ marginTop: 12 }}>
              Pick something you haven't used here before. You'll stay logged in once it's saved.
            </ZenText>
          </View>
          <View style={{ gap: 14 }}>
            <ZenInput
              label="New password"
              placeholder="At least 6 characters"
              value={pw}
              onChangeText={setPw}
              autoFocus
              secureTextEntry
            />
            <ZenInput
              label="Confirm password"
              labelSuffix={pwMismatch ? "· doesn't match" : pwMatch ? '· ✓' : ''}
              labelTone={pwMismatch ? 'accent' : 'fg3'}
              placeholder="Re-enter your password"
              value={pw2}
              onChangeText={setPw2}
              secureTextEntry
              errorBorder={pwMismatch}
              okBorder={pwMatch}
              onSubmitEditing={submit}
            />
            {error ? <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText> : null}
          </View>
        </Section>
      </ScrollView>
      <Anchor>
        <ZenButton
          label={loading ? 'Saving…' : 'Save password'}
          variant={valid && !loading ? 'primary' : 'disabled'}
          trailingArrow={!loading}
          onPress={submit}
        />
        <View style={{ alignItems: 'center' }}>
          <ZenButton label="Cancel" variant="link" disabled={loading} onPress={() => void cancelRecovery()} />
        </View>
      </Anchor>
    </View>
  );
}
