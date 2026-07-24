import type { ZenEvent } from '../data/events';
import type { ApiEvent, ExtractedDraft } from '../types/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** An editable stop in the create flow (seeded from AI extraction). */
export type DraftLocation = { name: string; label: string | null; query: string };

export type Draft = {
  message?: string;
  /** Raw AI extraction — carries the non-edited fields (startsAtISO, guests, currency…). */
  extracted?: ExtractedDraft;
  fields?: {
    title: string;
    date: string;
    time: string;
    attendees: string;
    budget: string;
    splitMode: string;
  };
  /** Ordered stops, edited in the confirm step's locations editor. */
  locations?: DraftLocation[];
  /** The event created by POST /events, handed to CreateSuccess → EventDetail. */
  created?: ApiEvent;
};

export type RootStackParamList = {
  Splash: undefined;
  SignUp: undefined;
  Login: undefined;
  Forgot: undefined;
  Keyboard: undefined;
  Events: undefined;
  // The API event is a superset of ZenEvent, so either passes structurally.
  EventDetail: { event: ZenEvent };
  EventLocations: { event: ZenEvent };
  EditEvent: { event: ZenEvent };
  PlannerChart: { event: ZenEvent };
  Splitter: { eventId: string; title?: string };
  Album: { eventId: string; title?: string };
  CreateDescribe: undefined;
  CreateConfirm: undefined;
  CreateProcessing: undefined;
  CreateSuccess: undefined;
  Settings: undefined;
};

export type ScreenProps<K extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, K>;
