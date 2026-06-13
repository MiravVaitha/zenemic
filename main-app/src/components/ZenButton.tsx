import React from 'react';
import { Pressable, View, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenText } from './ZenText';
import { IconArrow } from '../icons';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger' | 'disabled' | 'link';

export interface ZenButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  trailingArrow?: boolean;
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export function ZenButton({
  label,
  onPress,
  variant = 'primary',
  trailingArrow,
  leading,
  style,
  fullWidth = true,
}: ZenButtonProps) {
  const t = useTheme();

  if (variant === 'link') {
    return (
      <Pressable onPress={onPress} hitSlop={6} style={style}>
        <ZenText variant="mark" tone="fg2">{label}</ZenText>
      </Pressable>
    );
  }

  const palette: Record<Exclude<Variant, 'link'>, { bg: string; color: string; border?: string }> = {
    primary: { bg: t.fg, color: t.bg },
    accent: { bg: t.accent, color: '#0a0a0a' },
    ghost: { bg: 'transparent', color: t.fg, border: t.hairline },
    danger: { bg: 'transparent', color: t.danger, border: t.danger },
    disabled: { bg: t.fg3Bg, color: t.fg3 },
  };
  const p = palette[variant];

  return (
    <Pressable
      onPress={variant === 'disabled' ? undefined : onPress}
      style={({ pressed }) => [
        {
          width: fullWidth ? '100%' : undefined,
          paddingVertical: 16,
          paddingHorizontal: 20,
          borderRadius: RADIUS.md,
          borderWidth: p.border ? 0.5 : 0,
          borderColor: p.border,
          backgroundColor: p.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: pressed && variant !== 'disabled' ? 0.85 : 1,
          transform: pressed && variant !== 'disabled' ? [{ scale: 0.985 }] : undefined,
        },
        style,
      ]}
    >
      {leading ? <View style={{ marginRight: 4 }}>{leading}</View> : null}
      <ZenText
        style={{ color: p.color, fontFamily: FONTS.sansMedium, fontSize: 15, letterSpacing: -0.07 }}
      >
        {label}
      </ZenText>
      {trailingArrow ? (
        <View style={{ marginLeft: 4 }}>
          <IconArrow color={p.color} />
        </View>
      ) : null}
    </Pressable>
  );
}
