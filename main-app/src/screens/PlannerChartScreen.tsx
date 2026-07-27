import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { ZenInput } from '../components/ZenInput';
import { ChartTimeline } from '../components/ChartTimeline';
import { Spinner } from '../components/Spinner';
import { IconClose, IconEdit, IconPlus } from '../icons';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { STAGE_TAGS } from '../data/chart';
import type { ApiChart, ApiStage } from '../types/api';
import { ScreenProps } from '../navigation/types';

const MAX_STAGES = 8; // matches the backend editChartSchema cap

let draftSeq = 0;
// The temp id is a React key only — the save payload carries no ids (server reassigns them all).
const blankStage = (): ApiStage => ({
  id: `draft-${++draftSeq}`,
  tag: 'PRE',
  t: '',
  heading: '',
  body: '',
  kind: 'next',
  done: false,
});

export function PlannerChartScreen({ navigation, route }: ScreenProps<'PlannerChart'>) {
  const t = useTheme();
  const ev = route.params.event;
  const keyboardInset = useKeyboardInset();
  const [chart, setChart] = useState<ApiChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftStages, setDraftStages] = useState<ApiStage[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .getChart(ev.id)
      .then((c) => {
        if (alive) {
          setChart(c);
          setError(null);
        }
      })
      .catch((e: unknown) => alive && setError(friendlyError(e, 'Couldn’t load the planner chart.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ev.id]);

  useFocusEffect(load);

  const stages = chart?.stages ?? [];
  const doneCount = stages.filter((s) => s.done).length;
  const hasInvalid = draftStages.some((s) => !s.t.trim() || !s.heading.trim());
  const atCap = draftStages.length >= MAX_STAGES;

  const toggle = async (i: number) => {
    const s = stages[i];
    if (!s || !chart) return;
    const next = !s.done;
    setChart({ ...chart, stages: chart.stages.map((x) => (x.id === s.id ? { ...x, done: next } : x)) });
    try {
      await api.setStageDone(ev.id, s.id, next);
    } catch {
      setChart((c) => (c ? { ...c, stages: c.stages.map((x) => (x.id === s.id ? { ...x, done: s.done } : x)) } : c));
    }
  };

  const startEdit = () => {
    // A failed generation can leave 0 stages — seed one blank so the chart stays editable.
    setDraftStages(stages.length ? stages.map((s) => ({ ...s })) : [blankStage()]);
    setShowErrors(false);
    setError(null);
    setEditing(true);
  };

  const editStage = (i: number, patch: Partial<ApiStage>) =>
    setDraftStages((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const addStage = () => setDraftStages((d) => (d.length >= MAX_STAGES ? d : [...d, blankStage()]));

  const removeStage = (i: number) => setDraftStages((d) => (d.length <= 1 ? d : d.filter((_, j) => j !== i)));

  const moveStage = (i: number, dir: -1 | 1) =>
    setDraftStages((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    setShowErrors(false);
  };

  const saveEdit = async () => {
    if (busy) return;
    if (draftStages.some((s) => !s.t.trim() || !s.heading.trim())) {
      setShowErrors(true);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await api.editChart(
        ev.id,
        draftStages.map((s) => ({
          tag: s.tag,
          t: s.t.trim(),
          heading: s.heading.trim(),
          body: s.body.trim(),
          kind: s.kind.toUpperCase(),
          done: s.done,
        })),
      );
      setChart(c);
      setEditing(false);
      setShowErrors(false);
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t save the planner chart.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="EVENT PLANNER CHART" onBack={() => navigation.goBack()} showMenu={false} />
      {loading && !chart ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={22} borderWidth={2} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <Section paddingTop={22} gap={20}>
            <View>
              <ZenText variant="eyebrow" tone="fg3">{chart?.sub ?? ''}</ZenText>
              <ZenText variant="h2" style={{ marginTop: 4 }}>{chart?.title ?? ev.title}</ZenText>
            </View>

            {!editing ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.32, color: t.fg3 }}>
                    {String(doneCount).padStart(2, '0')} / {String(stages.length).padStart(2, '0')} DONE
                  </ZenText>
                </View>
                <ChartTimeline stages={stages} done={stages.map((s) => s.done)} onToggle={toggle} />
                {error ? <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText> : null}
                <ZenButton label="Edit chart" variant="ghost" leading={<IconEdit color={t.fg} />} style={{ marginTop: 4 }} onPress={startEdit} />
              </>
            ) : (
              <>
                {draftStages.map((s, i) => (
                  <StageEditCard
                    key={s.id}
                    stage={s}
                    index={i}
                    count={draftStages.length}
                    showErrors={showErrors}
                    onEdit={(patch) => editStage(i, patch)}
                    onMove={(dir) => moveStage(i, dir)}
                    onRemove={() => removeStage(i)}
                  />
                ))}
                <ZenButton
                  label={atCap ? `Add stage · ${MAX_STAGES}/${MAX_STAGES}` : 'Add stage'}
                  variant={atCap ? 'disabled' : 'ghost'}
                  leading={atCap ? undefined : <IconPlus color={t.fg} size={14} />}
                  onPress={addStage}
                />
                {error ? (
                  <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText>
                ) : showErrors && hasInvalid ? (
                  <ZenText variant="body" style={{ color: t.danger }}>Fill in the required When and Heading fields.</ZenText>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <ZenButton label="Cancel" variant={busy ? 'disabled' : 'ghost'} style={{ flex: 1 }} fullWidth={false} onPress={cancelEdit} />
                  <ZenButton label={busy ? 'Saving…' : 'Save chart'} variant={busy ? 'disabled' : 'primary'} style={{ flex: 1 }} fullWidth={false} onPress={saveEdit} />
                </View>
              </>
            )}
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function StageEditCard({
  stage,
  index,
  count,
  showErrors,
  onEdit,
  onMove,
  onRemove,
}: {
  stage: ApiStage;
  index: number;
  count: number;
  showErrors: boolean;
  onEdit: (patch: Partial<ApiStage>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTheme();
  const tInvalid = showErrors && !stage.t.trim();
  const headingInvalid = showErrors && !stage.heading.trim();

  return (
    <View style={{ gap: 8, borderWidth: 0.5, borderColor: t.hairline, borderRadius: RADIUS.lg, padding: 14, backgroundColor: t.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ZenText variant="eyebrow" tone="fg3" style={{ flex: 1 }}>STAGE {index + 1}</ZenText>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <CardControl glyph="↑" disabled={index === 0} onPress={() => onMove(-1)} />
          <CardControl glyph="↓" disabled={index === count - 1} onPress={() => onMove(1)} />
          <CardControl glyph={<IconClose color={t.fg} size={10} />} disabled={count === 1} onPress={onRemove} />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <ZenText variant="label" tone="fg3">Stage type</ZenText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {STAGE_TAGS.map((tag) => {
            const selected = stage.tag === tag;
            return (
              <Pressable
                key={tag}
                onPress={() => onEdit({ tag })}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: RADIUS.pill,
                  borderWidth: 0.5,
                  borderColor: selected ? t.fg : t.hairline,
                  backgroundColor: selected ? t.fg : 'transparent',
                }}
              >
                <ZenText
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 10.5,
                    letterSpacing: 1.47,
                    textTransform: 'uppercase',
                    color: selected ? t.bg : t.fg2,
                  }}
                >
                  {tag}
                </ZenText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ZenInput
        label="When"
        labelSuffix={tInvalid ? '· required' : ''}
        labelTone={tInvalid ? 'accent' : 'fg3'}
        errorBorder={tInvalid}
        placeholder="T -2H · 6:30 PM · SAT 9AM"
        value={stage.t}
        onChangeText={(v) => onEdit({ t: v })}
      />
      <ZenInput
        label="Heading"
        labelSuffix={headingInvalid ? '· required' : ''}
        labelTone={headingInvalid ? 'accent' : 'fg3'}
        errorBorder={headingInvalid}
        value={stage.heading}
        onChangeText={(v) => onEdit({ heading: v })}
      />
      <ZenInput label="Detail" labelSuffix="· optional" value={stage.body} onChangeText={(v) => onEdit({ body: v })} multiline />
    </View>
  );
}

function CardControl({ glyph, disabled, onPress }: { glyph: React.ReactNode; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      hitSlop={6}
      style={{
        width: 26,
        height: 26,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.fg3Bg,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {typeof glyph === 'string' ? (
        <ZenText style={{ fontFamily: FONTS.monoMedium, fontSize: 14, color: t.fg }}>{glyph}</ZenText>
      ) : (
        glyph
      )}
    </Pressable>
  );
}
