import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenInput } from '../components/ZenInput';
import { ZenButton } from '../components/ZenButton';
import { useAuth } from '../lib/auth';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { ScreenProps } from '../navigation/types';

function friendly(message: string): string {
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first — check your inbox for the link.';
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
  return message;
}

export function LoginScreen({ navigation }: ScreenProps<'Login'>) {
  const t = useTheme();
  const { signIn, authNotice, clearAuthNotice } = useAuth();
  const keyboardInset = useKeyboardInset();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = email.includes('@') && pw.length > 0;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    clearAuthNotice();
    try {
      await signIn(email, pw);
      // Success: AppNavigator swaps to the app stack automatically.
    } catch (e) {
      setError(friendly((e as Error).message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="BACK TO SIGN UP" onBack={() => navigation.replace('SignUp')} showMenu={false} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section paddingTop={40} gap={28}>
          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>WELCOME BACK</ZenText>
            <ZenText variant="h1">Pick up where{'\n'}you left off.</ZenText>
          </View>
          <View style={{ gap: 14 }}>
            <ZenInput label="Email" placeholder="eve@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <ZenInput label="Password" placeholder="Your password" value={pw} onChangeText={setPw} secureTextEntry />
            <View style={{ alignItems: 'flex-end' }}>
              <ZenButton label="Forgot password" variant="link" onPress={() => navigation.navigate('Forgot')} />
            </View>
            {authNotice ? <ZenText variant="body" style={{ color: t.danger }}>{authNotice}</ZenText> : null}
            {error ? <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText> : null}
          </View>
        </Section>
      </ScrollView>
      <Anchor>
        <ZenButton
          label={loading ? 'Logging in…' : 'Log in'}
          variant={valid && !loading ? 'primary' : 'disabled'}
          trailingArrow={!loading}
          onPress={submit}
        />
      </Anchor>
    </View>
  );
}
