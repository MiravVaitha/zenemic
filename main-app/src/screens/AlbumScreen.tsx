import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { Spinner } from '../components/Spinner';
import { IconClose, IconDownload, IconShare, IconTrash } from '../icons';
import { api, ApiError } from '../lib/api';
import { friendlyError } from '../lib/errors';
import type { AlbumPhoto } from '../types/api';
import { ScreenProps } from '../navigation/types';

const GAP = 8;
const H_PAD = 24; // matches <Section> paddingHorizontal
const MAX_DIM = 2048; // downscale the long edge before upload (keeps storage bounded)

/** Resize the long edge to MAX_DIM (only when larger); we always re-encode as JPEG. */
function resizeActions(w?: number, h?: number): Action[] {
  if (!w || !h || Math.max(w, h) <= MAX_DIM) return [];
  return w >= h ? [{ resize: { width: MAX_DIM } }] : [{ resize: { height: MAX_DIM } }];
}

export function AlbumScreen({ route, navigation }: ScreenProps<'Album'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { eventId, title } = route.params;

  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null); // index into `photos`

  // Transient feedback that renders INSIDE the lightbox (the grid `notice` is hidden
  // behind the open Modal). `showSticky` stays until replaced (in-progress);
  // `flash` auto-dismisses (final result).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSticky = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
  }, []);
  const flash = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(() => {
    let alive = true;
    api
      .getAlbum(eventId)
      .then((a) => alive && setPhotos(a.photos))
      .catch(
        (e: ApiError) =>
          alive &&
          setNotice(
            e.notConfigured ? 'Shared albums aren’t set up yet.' : friendlyError(e, 'Couldn’t load the album.'),
          ),
      )
      .finally(() => alive && (setLoading(false), setRefreshing(false)));
    return () => {
      alive = false;
    };
  }, [eventId]);

  useFocusEffect(load);

  // ── Masonry: two columns, each photo dropped into the shorter one ──────────
  const colWidth = (winW - H_PAD * 2 - GAP) / 2;
  const columns = useMemo(() => {
    const cols: { photo: AlbumPhoto; h: number; index: number }[][] = [[], []];
    const heights = [0, 0];
    photos.forEach((photo, index) => {
      const ar = photo.width && photo.height ? photo.height / photo.width : 1;
      const h = Math.round(colWidth * ar);
      const c = heights[0] <= heights[1] ? 0 : 1;
      cols[c].push({ photo, h, index });
      heights[c] += h + GAP;
    });
    return cols;
  }, [photos, colWidth]);

  // ── Upload (multi-select, compressed) ──────────────────────────────────────
  async function uploadOne(asset: ImagePicker.ImagePickerAsset) {
    const edited = await manipulateAsync(asset.uri, resizeActions(asset.width, asset.height), {
      compress: 0.7,
      format: SaveFormat.JPEG,
    });
    const { uploadUrl, key } = await api.albumUploadUrl(eventId, { contentType: 'image/jpeg', ext: 'jpg' });
    const blob = await (await fetch(edited.uri)).blob();
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    if (!put.ok) throw new Error('Upload failed');
    await api.addPhoto(eventId, { key, width: edited.width, height: edited.height });
  }

  const addPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNotice('Photo library permission is needed to add photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 1,
    });
    if (res.canceled || !res.assets.length) return;

    setBusy(true);
    setNotice(null);
    let done = 0;
    try {
      for (const asset of res.assets) {
        try {
          await uploadOne(asset);
        } catch (e) {
          const err = e as ApiError;
          if (err.notConfigured) {
            setNotice('Shared albums aren’t set up yet (object storage not configured).');
            break;
          }
          if (err.status === 400) {
            setNotice(friendlyError(e, 'That album is full.')); // album full — stop early
            break;
          }
          throw e;
        }
        done += 1;
        setProgress({ done, total: res.assets.length });
      }
    } catch (e) {
      setNotice(friendlyError(e, 'Some photos couldn’t be uploaded.'));
    } finally {
      setBusy(false);
      setProgress(null);
      load();
    }
  };

  // ── Download / share (save to the phone's Photos) ──────────────────────────
  async function hasMediaPerm(): Promise<boolean> {
    const perm = await MediaLibrary.requestPermissionsAsync(true); // write-only ("Add Photos") is enough
    return perm.granted;
  }

  /**
   * A complete, correctly-named local .jpg for a photo. Prefers the bytes
   * expo-image already cached for display — no network, immune to signed-URL
   * expiry, and never partial — and falls back to a fresh download. Any stale
   * copy is deleted first so we never hand a half-written file to MediaLibrary
   * (which silently drops invalid files → "saved" but nothing in the camera roll).
   */
  async function localJpegFor(photo: AlbumPhoto): Promise<string> {
    const dest = new File(Paths.cache, `zenemic-${photo.id}.jpg`);
    try {
      if (dest.exists) dest.delete();
    } catch {
      /* ignore */
    }
    try {
      const cached = await ExpoImage.getCachePathAsync(photo.id);
      if (cached) {
        const src = new File(cached.startsWith('file://') ? cached : `file://${cached}`);
        if (src.exists) {
          src.copy(dest);
          if (dest.exists) return dest.uri;
        }
      }
    } catch {
      /* fall back to a network download */
    }
    const file = await File.downloadFileAsync(photo.url, dest, { idempotent: true });
    return file.uri;
  }

  const savePhoto = async (photo: AlbumPhoto) => {
    if (!(await hasMediaPerm())) {
      flash('Photos permission needed to save');
      return;
    }
    showSticky('Saving…');
    try {
      await MediaLibrary.saveToLibraryAsync(await localJpegFor(photo));
      flash('Saved to Photos ✓');
    } catch {
      flash('Couldn’t save that photo');
    }
  };

  const sharePhoto = async (photo: AlbumPhoto) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        flash('Sharing isn’t available here');
        return;
      }
      showSticky('Preparing…');
      const uri = await localJpegFor(photo);
      setToast(null); // clear before the OS share sheet takes over
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
    } catch {
      flash('Couldn’t share that photo');
    }
  };

  const saveAll = async () => {
    if (!photos.length) return;
    if (!(await hasMediaPerm())) {
      setNotice('Photos permission is needed to save.');
      return;
    }
    setProgress({ done: 0, total: photos.length });
    let ok = 0;
    for (let i = 0; i < photos.length; i += 1) {
      try {
        await MediaLibrary.saveToLibraryAsync(await localJpegFor(photos[i]!));
        ok += 1;
      } catch {
        /* skip a single failure, keep going */
      }
      setProgress({ done: i + 1, total: photos.length });
    }
    setProgress(null);
    setNotice(
      ok === photos.length
        ? `Saved ${ok} photo${ok === 1 ? '' : 's'} to your Photos.`
        : `Saved ${ok} of ${photos.length} — some couldn’t be saved.`,
    );
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const confirmDelete = (photo: AlbumPhoto) => {
    Alert.alert('Delete photo?', 'This removes it from the shared album for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setViewer(null);
          setPhotos((prev) => prev.filter((p) => p.id !== photo.id)); // optimistic
          try {
            await api.deletePhoto(eventId, photo.id);
          } catch (e) {
            setNotice(friendlyError(e, 'Couldn’t delete that photo.'));
            load();
          }
        },
      },
    ]);
  };

  const current = viewer !== null ? photos[viewer] : undefined;
  const working = busy || progress !== null;
  const progressLabel = progress ? `${progress.done}/${progress.total}` : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ZenChrome label="SHARED ALBUM" onBack={() => navigation.goBack()} showMenu={false} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={22} borderWidth={2} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load();
                }}
                tintColor={t.fg3}
              />
            }
          >
            <Section paddingTop={24} gap={18}>
              <ZenText variant="eyebrow" tone="fg3">
                {title ?? 'EVENT'} · {photos.length} {photos.length === 1 ? 'PHOTO' : 'PHOTOS'}
              </ZenText>

              {photos.length === 0 ? (
                <ZenText variant="body" tone="fg2">No photos yet. Add the first ones below.</ZenText>
              ) : (
                <View style={{ flexDirection: 'row', gap: GAP }}>
                  {columns.map((col, ci) => (
                    <View key={ci} style={{ width: colWidth }}>
                      {col.map(({ photo, h, index }) => (
                        <Pressable
                          key={photo.id}
                          onPress={() => setViewer(index)}
                          onLongPress={() => confirmDelete(photo)}
                          style={{ marginBottom: GAP }}
                        >
                          <ExpoImage
                            source={{ uri: photo.url, cacheKey: photo.id }}
                            cachePolicy="disk"
                            contentFit="cover"
                            transition={150}
                            style={{ width: colWidth, height: h, borderRadius: RADIUS.md, backgroundColor: t.fg3Bg }}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              {notice ? <ZenText variant="body" tone="fg2">{notice}</ZenText> : null}
            </Section>
          </ScrollView>

          <Anchor>
            {photos.length > 0 ? (
              <ZenButton
                label={progressLabel ? `Saving… ${progressLabel}` : 'Save all to Photos'}
                variant={working ? 'disabled' : 'ghost'}
                onPress={saveAll}
              />
            ) : null}
            <ZenButton
              label={busy ? (progressLabel ? `Uploading… ${progressLabel}` : 'Uploading…') : 'Add photos'}
              variant={working ? 'disabled' : 'primary'}
              onPress={addPhotos}
            />
          </Anchor>
        </>
      )}

      {/* Full-screen lightbox — swipe between photos, view + download individually */}
      <Modal visible={current != null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {viewer !== null && photos.length > 0 ? (
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={Math.min(viewer, photos.length - 1)}
              getItemLayout={(_, i) => ({ length: winW, offset: winW * i, index: i })}
              keyExtractor={(p) => p.id}
              onMomentumScrollEnd={(e) => setViewer(Math.round(e.nativeEvent.contentOffset.x / winW))}
              renderItem={({ item }) => (
                <View style={{ width: winW, height: winH, alignItems: 'center', justifyContent: 'center' }}>
                  <ExpoImage
                    source={{ uri: item.url, cacheKey: item.id }}
                    cachePolicy="disk"
                    contentFit="contain"
                    style={{ width: winW, height: winH * 0.8 }}
                  />
                </View>
              )}
            />
          ) : null}

          {/* Top bar: counter + close */}
          <View
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 20,
              right: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <ZenText style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
              {current ? `${(viewer ?? 0) + 1} / ${photos.length}` : ''}
            </ZenText>
            <Pressable onPress={() => setViewer(null)} hitSlop={12} style={{ padding: 6 }}>
              <IconClose color="#fff" size={16} />
            </Pressable>
          </View>

          {/* Bottom bar: toast + caption/uploader + actions */}
          {current ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + 20, paddingTop: 18, paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.32)' }}>
              {toast ? (
                <View style={{ alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.pill, marginBottom: 16 }}>
                  <ZenText style={{ color: '#fff', fontSize: 13 }}>{toast}</ZenText>
                </View>
              ) : null}
              {current.caption ? (
                <ZenText style={{ color: '#fff', fontSize: 15, marginBottom: 4 }}>{current.caption}</ZenText>
              ) : null}
              {current.uploaderName ? (
                <ZenText style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 14 }}>
                  Added by {current.uploaderName}
                </ZenText>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
                <ViewerAction icon={<IconDownload color="#fff" size={20} />} label="Save" onPress={() => savePhoto(current)} />
                <ViewerAction icon={<IconShare color="#fff" size={20} />} label="Share" onPress={() => sharePhoto(current)} />
                <ViewerAction icon={<IconTrash color="#fff" size={20} />} label="Delete" onPress={() => confirmDelete(current)} />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function ViewerAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 18,
        paddingVertical: 10,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      {icon}
      <ZenText style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>{label}</ZenText>
    </Pressable>
  );
}
