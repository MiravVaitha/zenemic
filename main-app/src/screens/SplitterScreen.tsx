import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { Spinner } from '../components/Spinner';
import { api, ApiError } from '../lib/api';
import { friendlyError } from '../lib/errors';
import type { Split } from '../types/api';
import { ScreenProps } from '../navigation/types';

export function SplitterScreen({ route, navigation }: ScreenProps<'Splitter'>) {
  const t = useTheme();
  const { eventId, title } = route.params;
  const [split, setSplit] = useState<Split | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (s: Split | null) => {
    setSplit(s);
    if (s) setAmounts(Object.fromEntries(s.shares.map((sh) => [sh.id, sh.amountMinor / 100])));
  };

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .getSplit(eventId)
      .then((s) => alive && (apply(s), setError(null)))
      .catch((e: unknown) => alive && setError(friendlyError(e, 'Couldn’t load the split.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId]);

  useFocusEffect(load);

  const run = async (fn: () => Promise<Split>, okNotice?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await fn());
      if (okNotice) setNotice(okNotice);
    } catch (e) {
      const err = e as ApiError;
      if (err.notConfigured) setNotice('Payments aren’t set up yet (Stripe not configured).');
      else setError(friendlyError(e, 'Couldn’t update the split.'));
    } finally {
      setBusy(false);
    }
  };

  const bump = (shareId: string, delta: number) =>
    setAmounts((a) => ({ ...a, [shareId]: Math.max(0, Math.round((a[shareId] + delta) * 100) / 100) }));

  const saveAmounts = () =>
    run(
      () =>
        api.updateShares(eventId, {
          shares: Object.entries(amounts).map(([shareId, amountMajor]) => ({ shareId, amountMajor })),
        }),
      'Amounts updated.',
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ZenChrome label="PAYMENT SPLITTER" onBack={() => navigation.goBack()} showMenu={false} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={22} borderWidth={2} />
        </View>
      ) : !split ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
          <ZenText variant="body" tone="fg2" style={{ textAlign: 'center' }}>
            No split yet for this event. Add a budget to the event to generate one.
          </ZenText>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <Section paddingTop={24} gap={20}>
              <View>
                <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 8 }}>
                  {title ?? 'EVENT'} · TOTAL
                </ZenText>
                <ZenText variant="h1">{split.total}</ZenText>
                {split.perHead ? (
                  <ZenText variant="body" tone="fg2" style={{ marginTop: 6 }}>
                    {split.perHead} a head · {split.shares.length} people · {split.mode.replace('_', ' ').toLowerCase()}
                  </ZenText>
                ) : null}
              </View>

              <View
                style={{
                  borderWidth: 0.5,
                  borderColor: t.hairline,
                  borderRadius: RADIUS.lg,
                  backgroundColor: t.surface,
                  overflow: 'hidden',
                }}
              >
                {split.shares.map((sh, i) => (
                  <View
                    key={sh.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      gap: 10,
                      borderBottomWidth: i === split.shares.length - 1 ? 0 : 0.5,
                      borderBottomColor: t.hairline,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <ZenText style={{ fontSize: 14.5, color: t.fg }}>{sh.name}</ZenText>
                      <ZenText
                        style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1, color: statusColor(sh.status, t), marginTop: 2 }}
                      >
                        {sh.status}
                        {sh.paymentUrl ? ' · TAP TO PAY' : ''}
                      </ZenText>
                    </View>
                    <Stepper onMinus={() => bump(sh.id, -1)} onPlus={() => bump(sh.id, 1)} t={t} disabled={sh.status === 'PAID'} />
                    <Pressable
                      onPress={() => sh.paymentUrl && Linking.openURL(sh.paymentUrl)}
                      style={{
                        minWidth: 72,
                        alignItems: 'center',
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        borderRadius: RADIUS.sm,
                        backgroundColor: t.fg3Bg,
                      }}
                    >
                      <ZenText style={{ fontFamily: FONTS.monoMedium, fontSize: 12, color: t.fg }}>
                        {format(amounts[sh.id] ?? sh.amountMinor / 100, split.currency)}
                      </ZenText>
                    </Pressable>
                  </View>
                ))}
              </View>

              {notice ? <ZenText variant="body" tone="fg2">{notice}</ZenText> : null}
              {error ? <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText> : null}
            </Section>
          </ScrollView>
          <Anchor>
            <ZenButton
              label={busy ? 'Working…' : 'Send payment requests'}
              variant={busy ? 'disabled' : 'primary'}
              onPress={() => run(() => api.sendSplit(eventId), 'Payment requests sent.')}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ZenButton label="Save amounts" variant="ghost" onPress={saveAmounts} />
              <ZenButton label="Reset to even" variant="ghost" onPress={() => run(() => api.recomputeSplit(eventId, { mode: 'EVEN' }), 'Reset to an even split.')} />
            </View>
          </Anchor>
        </>
      )}
    </View>
  );
}

function Stepper({ onMinus, onPlus, t, disabled }: { onMinus: () => void; onPlus: () => void; t: ReturnType<typeof useTheme>; disabled?: boolean }) {
  const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{ width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: t.fg3Bg, opacity: disabled ? 0.4 : 1 }}
    >
      <ZenText style={{ fontFamily: FONTS.monoMedium, fontSize: 14, color: t.fg }}>{label}</ZenText>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      <Btn label="−" onPress={onMinus} />
      <Btn label="+" onPress={onPlus} />
    </View>
  );
}

function statusColor(status: string, t: ReturnType<typeof useTheme>) {
  if (status === 'PAID') return t.green;
  if (status === 'REQUESTED') return t.accent;
  return t.fg3;
}

function format(major: number, currency: string) {
  const sym = currency.toLowerCase() === 'gbp' ? '£' : currency.toLowerCase() === 'usd' ? '$' : currency.toLowerCase() === 'eur' ? '€' : '';
  return `${sym}${major.toFixed(2)}`;
}
