import React, { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenText } from './ZenText';
import { formatDateLabel, formatTimeLabel, parseLabelsToDate } from '../lib/format';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * An event's when, as both the display labels and the machine instants. These
 * MUST move together: `startsAt` is what decides the calendar entry and the
 * planned/ongoing/previous bucket, so a label edited on its own is a silent lie.
 */
export interface WhenValue {
  dateLabel: string;
  timeLabel: string;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface DateTimePickerSheetProps {
  mode: 'date' | 'time' | null;
  temp: Date;
  onTempChange: (d: Date) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Native date/time picking for the "when" rows, shared by CreateConfirm and
 * EditEvent so the two can't drift. Pair the hook with <DateTimePickerSheet />:
 *
 *   const { openPicker, sheetProps } = useDateTimePicker(when, setWhen);
 *   <EditableRow label="Date" value={when.dateLabel} onPress={() => openPicker('date')} />
 *   <DateTimePickerSheet {...sheetProps} />
 *
 * Android uses the self-dismissing system dialog and ignores the sheet.
 */
export function useDateTimePicker(value: WhenValue, onChange: (next: WhenValue) => void) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  // iOS commits on "Done"; hold the in-progress wheel value so Cancel can drop it.
  const [temp, setTemp] = useState<Date>(() => new Date());

  // Open at whatever the row currently shows (parsed from the labels), so it
  // never jumps to an unrelated default or a tz-shifted instant.
  const baseDate = () => {
    const parsed = parseLabelsToDate(value.dateLabel, value.timeLabel);
    if (parsed) return parsed;
    if (value.startsAt) return value.startsAt;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0); // nothing to parse — start from tomorrow evening
    return d;
  };

  const applyStart = (d: Date) => {
    const durationMs =
      value.startsAt && value.endsAt && value.endsAt.getTime() > value.startsAt.getTime()
        ? value.endsAt.getTime() - value.startsAt.getTime()
        : TWO_HOURS_MS;
    onChange({
      dateLabel: formatDateLabel(d),
      timeLabel: formatTimeLabel(d),
      startsAt: d,
      endsAt: new Date(d.getTime() + durationMs), // preserve the event's duration
    });
  };

  const openPicker = (next: 'date' | 'time') => {
    const base = baseDate();
    if (Platform.OS === 'android') {
      // System dialog; date mode keeps the time-of-day from `value`, time mode keeps the date.
      DateTimePickerAndroid.open({
        value: base,
        mode: next,
        onChange: (event, d) => {
          if (event.type === 'set' && d) applyStart(d);
        },
      });
    } else {
      setTemp(base);
      setMode(next);
    }
  };

  const sheetProps: DateTimePickerSheetProps = {
    mode,
    temp,
    onTempChange: setTemp,
    onCancel: () => setMode(null),
    onConfirm: () => {
      applyStart(temp);
      setMode(null);
    },
  };

  return { openPicker, sheetProps };
}

/**
 * iOS picker sheet. Overlaid rather than inlined so it doesn't push the screen's
 * own content around. Renders nothing on Android (system dialog handles it).
 */
export function DateTimePickerSheet({
  mode,
  temp,
  onTempChange,
  onCancel,
  onConfirm,
}: DateTimePickerSheetProps) {
  const t = useTheme();
  if (Platform.OS === 'android') return null;

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onCancel}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: RADIUS.lg,
            borderTopRightRadius: RADIUS.lg,
            paddingBottom: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: t.hairline,
            }}
          >
            <Pressable onPress={onCancel} hitSlop={8}>
              <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.2, color: t.fg3 }}>
                CANCEL
              </ZenText>
            </Pressable>
            <ZenText variant="eyebrow" tone="fg3">
              {mode === 'time' ? 'PICK TIME' : 'PICK DATE'}
            </ZenText>
            <Pressable onPress={onConfirm} hitSlop={8}>
              <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.2, color: t.accent }}>
                DONE
              </ZenText>
            </Pressable>
          </View>
          <DateTimePicker
            value={temp}
            mode={mode === 'time' ? 'time' : 'date'}
            display="spinner"
            themeVariant={t.mode}
            onChange={(_e, d) => d && onTempChange(d)}
            style={{ backgroundColor: t.surface }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
