import React, { useEffect, useRef, useState } from 'react';
import { KeyboardTypeOptions, Pressable, TextInput } from 'react-native';
import { FONTS, useTheme } from '../theme';
import { ZenText } from './ZenText';

export interface EditableRowProps {
  label: string;
  value: string;
  isLast?: boolean;
  /** Inline text-edit mode (the default) — tapping swaps in a TextInput. */
  onChange?: (v: string) => void;
  /** Custom press (pickers / cycle / locked nav) — replaces the inline input. */
  onPress?: () => void;
  /** Flags the row like ZenInput's error state (accent label + "· required"). */
  invalid?: boolean;
  /** Shows `lockedMeta` instead of the EDIT affordance; tapping uses onPress. */
  locked?: boolean;
  lockedMeta?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Shown greyed when `value` is empty — e.g. a field the AI couldn't fill in. */
  placeholder?: string;
}

/** Tap-to-edit labeled row (the "Look right?" / EditEvent card rows). */
export function EditableRow({
  label,
  value,
  isLast = false,
  onChange,
  onPress,
  invalid = false,
  locked = false,
  lockedMeta = 'LOCKED · IN SPLITTER',
  keyboardType,
  placeholder,
}: EditableRowProps) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    onChange?.(v);
    setEditing(false);
  };

  const handlePress = () => {
    if (locked || onPress) {
      onPress?.();
    } else if (!editing) {
      setV(value); // re-sync in case the value changed since mount
      setEditing(true);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: t.hairline,
        gap: 12,
      }}
    >
      <ZenText
        style={{
          width: 110,
          fontFamily: FONTS.mono,
          fontSize: 10.5,
          letterSpacing: 1.47,
          textTransform: 'uppercase',
          color: invalid ? t.accent : t.fg3,
        }}
      >
        {label}
        {invalid ? ' · required' : ''}
      </ZenText>
      {editing ? (
        <TextInput
          ref={ref}
          value={v}
          onChangeText={setV}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={t.fg3}
          style={{
            flex: 1,
            paddingHorizontal: 10,
            paddingVertical: 6,
            fontSize: 14,
            color: t.fg,
            borderWidth: 0.5,
            borderColor: invalid ? t.accent : t.fg2,
            borderRadius: 8,
            backgroundColor: t.bg,
          }}
        />
      ) : (
        <>
          <ZenText style={{ flex: 1, fontSize: 14.5, color: value ? t.fg : t.fg3 }}>
            {value || placeholder || ''}
          </ZenText>
          <ZenText
            style={{ fontFamily: FONTS.mono, fontSize: 10, letterSpacing: 1.2, color: t.fg3 }}
          >
            {locked ? lockedMeta : 'EDIT'}
          </ZenText>
        </>
      )}
    </Pressable>
  );
}
