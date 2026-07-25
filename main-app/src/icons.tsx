import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

type IconProps = { color?: string; size?: number };

export const IconChart = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path d="M2 13h12M4 11V7M8 11V3M12 11V8" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
  </Svg>
);

export const IconCalendar = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Rect x={2} y={3.5} width={12} height={10} rx={1} stroke={color} strokeWidth={1.2} />
    <Path d="M2 6.5h12M5 2v3M11 2v3" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
  </Svg>
);

export const IconMoney = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Circle cx={8} cy={8} r={5.5} stroke={color} strokeWidth={1.2} />
    <Path
      d="M8 5v6M6 9.5c0 .8.9 1.5 2 1.5s2-.5 2-1.3-.7-1.2-2-1.5c-1.3-.3-2-.7-2-1.5C6 5.7 6.9 5.2 8 5.2s2 .7 2 1.5"
      stroke={color}
      strokeWidth={1.1}
      strokeLinecap="round"
    />
  </Svg>
);

export const IconPin = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path
      d="M8 14s4.5-4.4 4.5-7.5a4.5 4.5 0 10-9 0C3.5 9.6 8 14 8 14z"
      stroke={color}
      strokeWidth={1.2}
      strokeLinejoin="round"
    />
    <Circle cx={8} cy={6.5} r={1.6} stroke={color} strokeWidth={1.2} />
  </Svg>
);

export const IconPhotos = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Rect x={2.5} y={2.5} width={11} height={9} rx={1} stroke={color} strokeWidth={1.2} />
    <Path d="M2.5 9l3-2.5L8 9l2-1.5L13.5 11" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    <Circle cx={6} cy={5.5} r={0.9} fill={color} />
  </Svg>
);

export const IconCheck = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Path d="M3 7.2L5.6 10l5.5-6" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconPlus = ({ color = 'currentColor', size = 20 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path d="M10 4v12M4 10h12" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>
);

export const IconSpark = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path
      d="M8 1.5l1.4 4.6L14 7.5l-4.6 1.4L8 13.5l-1.4-4.6L2 7.5l4.6-1.4L8 1.5z"
      stroke={color}
      strokeWidth={1}
      fill="none"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconClock = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Circle cx={7} cy={7} r={5.5} stroke={color} strokeWidth={1.2} />
    <Path d="M7 4v3l2 1.5" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
  </Svg>
);

export const IconPlay = ({ color = 'currentColor', size = 12 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <Path d="M3 2.5v7l6-3.5-6-3.5z" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
  </Svg>
);

export const IconArchive = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Rect x={1.5} y={2.5} width={11} height={3} rx={0.5} stroke={color} strokeWidth={1.2} />
    <Path d="M2.5 5.5v6h9v-6M5.5 8h3" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
  </Svg>
);

export const IconChevron = ({ color = 'currentColor', size = 10 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 10 10" fill="none">
    <Path d="M3.5 1.5L7 5l-3.5 3.5" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconArrow = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Path d="M2 7h10M8 3l4 4-4 4" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconZen = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Path d="M2 11L11 3M3 3h8v8" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconBack = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path d="M10 3L5 8l5 5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconMail = ({ color = 'currentColor', size = 30 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
    <Rect x={4} y={7} width={22} height={16} rx={1.5} stroke={color} strokeWidth={1.5} />
    <Path d="M4 9l11 8 11-8" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
  </Svg>
);

export const IconBigCheck = ({ color = 'currentColor', size = 32 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Path
      d="M8 16.5l5.5 5.5L24 11"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const IconLogo = ({ color = 'currentColor', size = 22 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
    <Path d="M3 17L17 5M5 5h12v12" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconSend = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Path d="M2 12l10-5L2 2v4l7 1-7 1v4z" fill={color} />
  </Svg>
);

export const IconClose = ({ color = 'currentColor', size = 9 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 9 9" fill="none">
    <Path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
  </Svg>
);

export const IconEdit = ({ color = 'currentColor', size = 14 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <Path d="M2 7l3.5 3.5L12 4" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconDownload = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path d="M8 2v8M4.5 7L8 10.5 11.5 7" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M2.5 12.5h11" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
  </Svg>
);

export const IconShare = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path d="M8 10V2.5M5 5l3-3 3 3" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4 7.5H3v6h10v-6h-1" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconTrash = ({ color = 'currentColor', size = 16 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path d="M3 4.5h10M6.5 4.5V3h3v1.5M4 4.5l.6 8.5h6.8L12 4.5" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M6.5 7v3.5M9.5 7v3.5" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
  </Svg>
);
