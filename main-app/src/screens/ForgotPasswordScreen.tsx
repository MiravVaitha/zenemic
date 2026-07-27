import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenInput } from '../components/ZenInput';
import { ZenButton } from '../components/ZenButton';
import { IconMail } from '../icons';
import { useAuth } from '../lib/auth';
import { cooldownFor, friendlyAuthEmailError, MAX_RESENDS, normalise } from '../lib/authEmail';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { ScreenProps } from '../navigation/types';

export function ForgotPasswordScreen({ navigation }: ScreenProps<'Forgot'>) {
  const t = useTheme();
  const { resetPassword } = useAuth();
  const keyboardInset = useKeyboardInset();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Throttle state, keyed to the address it was earned against. `until` is
   * absolute epoch-ms rather than a ticking counter so backgrounding the app
   * can't desync it. Keying to the address is what stops "try a different
   * address" being a one-tap bypass: switching to a genuinely different inbox
   * starts fresh, re-entering the same one does not.
   */
  const [throttle, setThrottle] = useState<{ email: string; sends: number; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const applies = throttle !== null && throttle.email === normalise(email);
  const secondsLeft = applies ? Math.max(0, Math.ceil((throttle.until - now) / 1000)) : 0;
  const sends = applies ? throttle.sends : 0;
  const valid = email.includes('@') && email.includes('.');
  const exhausted = sends >= MAX_RESENDS;

  // Only tick while a countdown is actually running, and stop once it expires.
  useEffect(() => {
    if (!throttle || throttle.until <= Date.now()) return;
    const id = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= throttle.until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [throttle]);

  const send = async (isResend: boolean) => {
    if (!valid || loading || secondsLeft > 0) return;
    if (isResend && exhausted) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const target = normalise(email);
    // Any send to an address we've already mailed escalates the backoff,
    // whichever button triggered it; a new address starts over.
    const next = applies ? sends + 1 : 0;
    try {
      await resetPassword(email);
      setThrottle({ email: target, sends: next, until: Date.now() + cooldownFor(next) * 1000 });
      setNow(Date.now());
      setSent(true);
      if (isResend) setNotice('Sent again — check your inbox.');
    } catch (e) {
      const { message, retryAfter } = friendlyAuthEmailError(e);
      if (retryAfter) {
        setThrottle({ email: target, sends: next, until: Date.now() + retryAfter * 1000 });
        setNow(Date.now());
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Back to the input step. The cooldown is left in place: it only lifts if the
  // address they type next is a different one.
  const tryAnotherAddress = () => {
    setSent(false);
    setError(null);
    setNotice(null);
  };

  const resendLabel = loading ? 'Sending…' : secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend link';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome
        label={sent ? 'CHECK YOUR INBOX' : 'BACK TO LOGIN'}
        onBack={() => navigation.goBack()}
        showMenu={false}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {!sent ? (
          <Section paddingTop={40} gap={28}>
            <View>
              <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>FORGOT IT?</ZenText>
              <ZenText variant="h1">No worries.{'\n'}Let's get you{'\n'}back in.</ZenText>
              <ZenText variant="body" style={{ marginTop: 12 }}>
                Enter the email tied to your Zenemic account and we'll send a one-time reset link.
              </ZenText>
            </View>
            <ZenInput
              label="Email"
              placeholder="eve@email.com"
              value={email}
              onChangeText={setEmail}
              autoFocus
              keyboardType="email-address"
              autoCapitalize="none"
              onSubmitEditing={() => send(false)}
            />
            {error ? <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText> : null}
          </Section>
        ) : (
          <Section paddingTop={60} gap={28} style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                borderWidth: 0.5,
                borderColor: t.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconMail color={t.accent} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <ZenText variant="eyebrow" tone="fg3">SENT</ZenText>
              <ZenText variant="h1" style={{ textAlign: 'center', marginTop: 4 }}>Check your{'\n'}inbox.</ZenText>
              <ZenText variant="body" style={{ marginTop: 12, textAlign: 'center', maxWidth: 280 }}>
                We've sent a reset link to <ZenText style={{ color: t.fg, fontWeight: '500' }}>{email}</ZenText>. It expires in 15 minutes.
              </ZenText>
            </View>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <ZenText variant="mark" tone="fg3">NO EMAIL AFTER A MINUTE?</ZenText>
              {exhausted ? (
                <ZenText variant="body" style={{ textAlign: 'center', maxWidth: 280 }}>
                  Still nothing? Try a different address, or contact support.
                </ZenText>
              ) : (
                <ZenButton
                  label={resendLabel}
                  variant="link"
                  disabled={loading || secondsLeft > 0}
                  onPress={() => send(true)}
                />
              )}
              <ZenButton label="Try a different address" variant="link" onPress={tryAnotherAddress} />
            </View>
            {notice ? (
              <ZenText variant="body" tone="green" style={{ textAlign: 'center' }}>{notice}</ZenText>
            ) : null}
            {error ? (
              <ZenText variant="body" style={{ color: t.danger, textAlign: 'center' }}>{error}</ZenText>
            ) : null}
          </Section>
        )}
      </ScrollView>
      <Anchor>
        {!sent ? (
          <ZenButton
            label={loading ? 'Sending…' : secondsLeft > 0 ? `Try again in ${secondsLeft}s` : 'Send reset link'}
            variant={valid && !loading && secondsLeft === 0 ? 'primary' : 'disabled'}
            trailingArrow={!loading && secondsLeft === 0}
            onPress={() => send(false)}
          />
        ) : (
          <ZenButton label="Back to log in" variant="primary" onPress={() => navigation.goBack()} />
        )}
      </Anchor>
    </View>
  );
}
