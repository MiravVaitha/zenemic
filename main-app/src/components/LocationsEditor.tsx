import React from 'react';
import { Pressable, View } from 'react-native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenText } from './ZenText';
import { ZenButton } from './ZenButton';
import { ZenInput } from './ZenInput';
import { IconClose, IconPlus } from '../icons';

/** One editable stop. `key` is a React key only; `query` feeds the maps search. */
export type LocationDraft = { key: string; name: string; label: string; query: string };

const MAX_LOCATIONS = 6;

let seq = 0;
export const blankLocation = (): LocationDraft => ({ key: `loc-${++seq}`, name: '', label: '', query: '' });

/** Seed editor rows from API/extraction stops. */
export function toLocationDrafts(
  stops: { name: string; label: string | null; query?: string }[],
): LocationDraft[] {
  return stops.length
    ? stops.map((s) => ({ key: `loc-${++seq}`, name: s.name, label: s.label ?? '', query: s.query ?? s.name }))
    : [blankLocation()];
}

/** Editor rows → the API payload shape, dropping empty (name-less) rows. */
export function fromLocationDrafts(
  locs: LocationDraft[],
): { name: string; label: string | null; query: string }[] {
  return locs
    .map((l) => ({
      name: l.name.trim(),
      label: l.label.trim() || null,
      query: (l.query || l.name).trim(),
    }))
    .filter((l) => l.name.length > 0);
}

/**
 * Add / reorder / remove list of event stops — the same interaction as the
 * planner-chart editor. Used by the create-confirm and EditEvent screens.
 */
export function LocationsEditor({
  locations,
  setLocations,
  showErrors = false,
  max = MAX_LOCATIONS,
}: {
  locations: LocationDraft[];
  setLocations: React.Dispatch<React.SetStateAction<LocationDraft[]>>;
  showErrors?: boolean;
  max?: number;
}) {
  const t = useTheme();
  const atCap = locations.length >= max;

  const edit = (i: number, patch: Partial<LocationDraft>) =>
    setLocations((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () => setLocations((d) => (d.length >= max ? d : [...d, blankLocation()]));
  const remove = (i: number) => setLocations((d) => (d.length <= 1 ? d : d.filter((_, j) => j !== i)));
  const move = (i: number, dir: -1 | 1) =>
    setLocations((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <View style={{ gap: 12 }}>
      {locations.map((loc, i) => {
        const nameInvalid = showErrors && !loc.name.trim();
        return (
          <View
            key={loc.key}
            style={{
              gap: 8,
              borderWidth: 0.5,
              borderColor: t.hairline,
              borderRadius: RADIUS.lg,
              padding: 14,
              backgroundColor: t.surface,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ZenText variant="eyebrow" tone="fg3" style={{ flex: 1 }}>
                {i === 0 ? 'PRIMARY STOP' : `STOP ${i + 1}`}
              </ZenText>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                <Ctrl glyph="↑" disabled={i === 0} onPress={() => move(i, -1)} />
                <Ctrl glyph="↓" disabled={i === locations.length - 1} onPress={() => move(i, 1)} />
                <Ctrl
                  glyph={<IconClose color={t.fg} size={10} />}
                  disabled={locations.length === 1}
                  onPress={() => remove(i)}
                />
              </View>
            </View>

            <ZenInput
              label="Place"
              labelSuffix={nameInvalid ? '· required' : ''}
              labelTone={nameInvalid ? 'accent' : 'fg3'}
              errorBorder={nameInvalid}
              placeholder="Sister Ray, Hackney"
              value={loc.name}
              onChangeText={(v) => edit(i, { name: v, query: v })}
            />
            <ZenInput
              label="Label"
              labelSuffix="· optional"
              placeholder="Venue · After-party · Meet point"
              value={loc.label}
              onChangeText={(v) => edit(i, { label: v })}
            />
          </View>
        );
      })}

      <ZenButton
        label={atCap ? `Add location · ${max}/${max}` : 'Add location'}
        variant={atCap ? 'disabled' : 'ghost'}
        leading={atCap ? undefined : <IconPlus color={t.fg} size={14} />}
        onPress={add}
      />
    </View>
  );
}

function Ctrl({ glyph, disabled, onPress }: { glyph: React.ReactNode; disabled?: boolean; onPress: () => void }) {
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
