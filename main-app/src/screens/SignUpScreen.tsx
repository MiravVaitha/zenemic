import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { ZenBrandBar } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenInput } from '../components/ZenInput';
import { ZenButton } from '../components/ZenButton';
import { IconMail } from '../icons';
import { useAuth } from '../lib/auth';
import { cooldownFor, friendlyAuthEmailError, MAX_RESENDS } from '../lib/authEmail';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { ScreenProps } from '../navigation/types';

export function SignUpScreen({ navigation }: ScreenProps<'SignUp'>) {
  const t = useTheme();
  const { signUp, resendConfirmation, authNotice, clearAuthNotice } = useAuth();
  const keyboardInset = useKeyboardInset();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Resend throttle for the confirmation email. `until` is absolute epoch-ms rather
   * than a ticking counter, so backgrounding the app can't desync it. The address is
   * fixed once we reach the "check your inbox" step, so unlike ForgotPassword there
   * is nothing to key the cooldown against.
   */
  const [sends, setSends] = useState(0);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const pwMatch = pw.length >= 6 && pw === pw2;
  const pwMismatch = pw2.length > 0 && pw !== pw2;
  const valid = name.length > 1 && email.includes('@') && pwMatch;
  const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));
  const exhausted = sends >= MAX_RESENDS;

  // Only tick while a countdown is actually running, and stop once it expires.
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  // Supabase opens its own ~60s window on the first send too, so the countdown
  // starts from the sign-up itself, not from the first resend.
  const startCooldown = (resendCount: number, seconds = cooldownFor(resendCount)) => {
    setSends(resendCount);
    setUntil(Date.now() + seconds * 1000);
    setNow(Date.now());
  };

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    clearAuthNotice();
    try {
      const { needsConfirmation } = await signUp(email, pw, name);
      if (needsConfirmation) {
        setSent(true);
        startCooldown(0);
      }
      // Otherwise a session exists and AppNavigator swaps to the app automatically.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading || secondsLeft > 0 || exhausted) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const next = sends + 1;
    try {
      await resendConfirmation(email);
      startCooldown(next);
      setNotice('Sent again — check your inbox.');
    } catch (e) {
      const { message, retryAfter } = friendlyAuthEmailError(e);
      // The server's own window beats our local guess when it tells us one.
      if (retryAfter) startCooldown(next, retryAfter);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ZenBrandBar />
        {/* Scrollable: the resend row, its countdown and any error sit below the
            fold on shorter screens, and a clipped error message reads as the
            button having silently done nothing. */}
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Section paddingTop={60} gap={28} style={{ alignItems: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 0.5, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <IconMail color={t.accent} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <ZenText variant="eyebrow" tone="fg3">CONFIRM YOUR EMAIL</ZenText>
            <ZenText variant="h1" style={{ textAlign: 'center', marginTop: 4 }}>Check your{'\n'}inbox.</ZenText>
            <ZenText variant="body" style={{ marginTop: 12, textAlign: 'center', maxWidth: 300 }}>
              We've sent a confirmation link to <ZenText style={{ color: t.fg, fontWeight: '500' }}>{email}</ZenText>. Tap it and you'll be signed straight in.
            </ZenText>
          </View>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ZenText variant="mark" tone="fg3">NO EMAIL AFTER A MINUTE?</ZenText>
            {exhausted ? (
              <ZenText variant="body" style={{ textAlign: 'center', maxWidth: 280 }}>
                Still nothing? Check the address is right, or contact support.
              </ZenText>
            ) : (
              <ZenButton
                label={loading ? 'Sending…' : secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend email'}
                variant="link"
                disabled={loading || secondsLeft > 0}
                onPress={resend}
              />
            )}
          </View>
          {notice ? (
            <ZenText variant="body" tone="green" style={{ textAlign: 'center' }}>{notice}</ZenText>
          ) : null}
          {error ? (
            <ZenText variant="body" style={{ color: t.danger, textAlign: 'center' }}>{error}</ZenText>
          ) : null}
        </Section>
        </ScrollView>
        <Anchor>
          <ZenButton label="Go to log in" variant="primary" onPress={() => navigation.replace('Login')} />
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
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>ACCOUNT</ZenText>
            <ZenText variant="h1">Create your{'\n'}account</ZenText>
            <ZenText variant="body" style={{ marginTop: 12 }}>
              Plan events, split costs and share photos all from one place.
            </ZenText>
          </View>
          <View style={{ gap: 14 }}>
            <ZenInput label="Full name" placeholder="Eve Lambert" value={name} onChangeText={setName} autoCapitalize="words" />
            <ZenInput label="Email" placeholder="eve@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <ZenInput label="Password" placeholder="At least 6 characters" value={pw} onChangeText={setPw} secureTextEntry />
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
            />
            {authNotice ? <ZenText variant="body" style={{ color: t.danger }}>{authNotice}</ZenText> : null}
            {error ? <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText> : null}
          </View>
        </Section>
      </ScrollView>
      <Anchor>
        <ZenButton
          label={loading ? 'Creating account…' : 'Continue'}
          variant={valid && !loading ? 'primary' : 'disabled'}
          trailingArrow={!loading}
          onPress={submit}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <ZenText variant="mark" tone="fg3">Have an account?</ZenText>
          <ZenButton label="Log in" variant="link" onPress={() => navigation.replace('Login')} />
        </View>
      </Anchor>
    </View>
  );
}
