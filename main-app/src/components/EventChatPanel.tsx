import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenText } from './ZenText';
import { Dot } from './Spinner';
import { IconClose, IconPlus, IconSend } from '../icons';
import { api, ApiError } from '../lib/api';
import { friendlyError } from '../lib/errors';
import type { ZenEvent } from '../data/events';

const SUGGESTIONS = ['Move start +30 min', 'Draft a reminder', "Who hasn't paid?"];
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

type Msg = { id?: string; role: 'user' | 'assistant'; content: string; imageUri?: string };
type Attachment = { uri: string; base64: string; mediaType: string };

/** The shared helper, with wording that suits a reply in the chat transcript. */
function chatError(e: unknown): string {
  if ((e as ApiError)?.code === 'network_error') {
    return "Couldn't reach the assistant just now. Give it another go in a sec.";
  }
  return friendlyError(e);
}

export function EventChatPanel({ event, onGrow }: { event: ZenEvent; onGrow?: () => void }) {
  const t = useTheme();
  const greeting = `Hi. I've got the full picture on ${event.title}. Ask me to update the splitter, the planner chart, the calendar, or just to draft a message. You can attach a receipt photo and I'll itemise + split it.`;
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: greeting }]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const composerFocused = useRef(false);

  useEffect(() => {
    let alive = true;
    api
      .getChat(event.id)
      .then((history) => {
        if (!alive) return;
        const mapped: Msg[] = history.map((m) => ({ id: m.id, role: m.role, content: m.content }));
        setMessages(mapped.length ? mapped : [{ role: 'assistant', content: greeting }]);
      })
      .catch(() => alive && setMessages([{ role: 'assistant', content: greeting }]))
      .finally(() => alive && setHistoryLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
    // Keep the composer visible above the keyboard when replies grow the card.
    if (composerFocused.current) onGrow?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  const pickReceipt = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
    if (res.canceled) return;
    const a = res.assets[0];
    if (!a?.base64) return;
    const mediaType = a.mimeType && ALLOWED.includes(a.mimeType) ? a.mimeType : 'image/jpeg';
    setAttachment({ uri: a.uri, base64: a.base64, mediaType });
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !attachment) || loading) return;
    const att = attachment;
    setMessages((m) => [...m, { role: 'user', content: text, imageUri: att?.uri }]);
    setInput('');
    setAttachment(null);
    setLoading(true);
    try {
      const reply = await api.sendChat(event.id, {
        text: text || undefined,
        receipt: att ? { imageBase64: att.base64, mediaType: att.mediaType } : undefined,
      });
      setMessages((m) => [...m, { id: reply.id, role: 'assistant', content: reply.content }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: chatError(e) }]);
    } finally {
      setLoading(false);
    }
  };

  const canSend = (!!input.trim() || !!attachment) && !loading;

  return (
    <View>
      <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>ASK ZENEMIC</ZenText>

      <View style={{ borderWidth: 0.5, borderColor: t.hairline, borderRadius: RADIUS.lg, backgroundColor: t.surface, overflow: 'hidden' }}>
        <ScrollView ref={scrollRef} style={{ maxHeight: 340, minHeight: 100 }} contentContainerStyle={{ padding: 14, gap: 10 }}>
          {messages.map((m, i) => (
            <ChatMessage key={m.id ?? i} message={m} />
          ))}
          {loading || historyLoading ? (
            <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 8, marginLeft: 4 }}>
              <Dot delay={0} />
              <Dot delay={150} />
              <Dot delay={300} />
            </View>
          ) : null}
        </ScrollView>

        {messages.length <= 1 && !loading && !historyLoading ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 10 }}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => send(s)}
                style={{ borderWidth: 0.5, borderColor: t.hairline, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <ZenText style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 1.05, textTransform: 'uppercase', color: t.fg2 }}>{s}</ZenText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {attachment ? (
          <View style={{ padding: 10, borderTopWidth: 0.5, borderTopColor: t.hairline, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={{ uri: attachment.uri }} style={{ width: 40, height: 52, borderRadius: 4, backgroundColor: t.fg3Bg }} />
            <ZenText style={{ flex: 1, fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 1, color: t.fg3, textTransform: 'uppercase' }}>Receipt photo attached</ZenText>
            <Pressable onPress={() => setAttachment(null)} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.fg3Bg, alignItems: 'center', justifyContent: 'center' }}>
              <IconClose color={t.fg2} />
            </Pressable>
          </View>
        ) : null}

        <View style={{ borderTopWidth: 0.5, borderTopColor: t.hairline, padding: 10, paddingLeft: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: t.surface }}>
          <Pressable
            onPress={pickReceipt}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.fg3Bg, alignItems: 'center', justifyContent: 'center' }}
          >
            <IconPlus color={t.fg} />
          </Pressable>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={attachment ? 'Add a note (optional)…' : 'Ask Zenemic anything…'}
            placeholderTextColor={t.fg3}
            multiline
            onFocus={() => {
              composerFocused.current = true;
            }}
            onBlur={() => {
              composerFocused.current = false;
            }}
            // iOS doesn't re-run its keyboard reveal when a multiline input grows a line,
            // so follow the composer ourselves while it's focused.
            onContentSizeChange={() => {
              if (composerFocused.current) onGrow?.();
            }}
            style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 14.5, color: t.fg, maxHeight: 110, paddingVertical: 6 }}
          />

          <Pressable
            onPress={() => send()}
            disabled={!canSend}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: canSend ? t.accent : t.fg3Bg, alignItems: 'center', justifyContent: 'center' }}
          >
            <IconSend color={canSend ? '#0a0a0a' : t.fg3} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ChatMessage({ message }: { message: Msg }) {
  const t = useTheme();
  const isUser = message.role === 'user';
  return (
    <View style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 6, maxWidth: '100%' }}>
      {message.imageUri ? (
        <Image source={{ uri: message.imageUri }} style={{ width: 120, height: 150, borderRadius: 10, backgroundColor: t.fg3Bg }} />
      ) : null}
      {message.content ? (
        <View
          style={{
            maxWidth: 280,
            paddingHorizontal: 13,
            paddingVertical: 9,
            borderRadius: 14,
            backgroundColor: isUser ? t.fg : t.fg3Bg,
            borderBottomRightRadius: isUser ? 4 : 14,
            borderBottomLeftRadius: isUser ? 14 : 4,
          }}
        >
          <ZenText style={{ color: isUser ? t.bg : t.fg, fontSize: 14, lineHeight: 20 }}>{message.content}</ZenText>
        </View>
      ) : null}
    </View>
  );
}
