import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api } from './api';
import { registerForPushNotificationsAsync } from './push';
import { confirmRedirectTo, parseAuthLink, recoveryRedirectTo } from './authLink';

/**
 * Set while the user arrived via a password-reset link. Tapping that link mints
 * a real session, so without this flag the navigator would drop them straight
 * into the app and they'd never see the "set a new password" step — see
 * AppNavigator, which checks `recovery.active` before `session`.
 * `error` is set when the link itself was bad, so the screen can say why.
 */
type Recovery = { active: boolean; error: string | null };

type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Returns { needsConfirmation } — true when email confirmation is required before login. */
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Send the sign-up confirmation email again. */
  resendConfirmation: (email: string) => Promise<void>;
  /**
   * Set when a confirmation link fails. Without it an expired link would dump the
   * user on the logged-out stack with no explanation of what went wrong.
   */
  authNotice: string | null;
  clearAuthNotice: () => void;
  recovery: Recovery;
  /** Finish recovery: sets the new password and keeps the user signed in. */
  updatePassword: (password: string) => Promise<void>;
  /** Abandon recovery — signs out, so a reset link can't double as a silent login. */
  cancelRecovery: () => Promise<void>;
};

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState<Recovery>({ active: false, error: null });
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  // Keeps the splash up until the launch URL has been inspected, so a cold start
  // from a reset link doesn't flash the logged-out stack first.
  const [linkChecked, setLinkChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Fires on web/`detectSessionInUrl`; native goes through the deep-link
      // handler below instead. Harmless to honour both.
      if (event === 'PASSWORD_RECOVERY') setRecovery({ active: true, error: null });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Password-reset and email-confirmation links both come back into the app as a
  // deep link. `detectSessionInUrl` is off (correct for native), so establish the
  // session from the URL by hand.
  useEffect(() => {
    let alive = true;
    // On a cold start `getInitialURL` and the `url` listener can both deliver the SAME
    // link. The credential in it is single-use, so the second attempt fails and would
    // stamp "no longer valid" over an exchange that had already succeeded.
    let handled: string | null = null;

    const handle = async (url: string | null) => {
      if (!url || url === handled) return;
      const link = parseAuthLink(url);
      if (!link || !alive) return;
      handled = url;

      // A bad link is a dead end for recovery (there is a dedicated screen for it)
      // but only a notice for confirmation, where the user stays logged out.
      const fail = (message: string) => {
        if (!alive) return;
        if (link.intent === 'recovery') setRecovery({ active: true, error: message });
        else setAuthNotice(message);
      };

      if (link.kind === 'error') {
        fail(link.message);
        return;
      }
      try {
        const { error } =
          link.kind === 'code'
            ? await supabase.auth.exchangeCodeForSession(link.code)
            : await supabase.auth.setSession({
                access_token: link.accessToken,
                refresh_token: link.refreshToken,
              });
        if (error) throw error;
        if (!alive) return;
        // Recovery has to be flagged even though a session now exists, or the
        // navigator drops the user into the app and they never set a password.
        // Confirmation wants exactly the opposite: the new session IS the point.
        if (link.intent === 'recovery') setRecovery({ active: true, error: null });
        else setAuthNotice(null);
      } catch {
        // Never surface the raw auth error — it distinguishes link states we
        // don't want to leak. The remedy is the same either way.
        fail(
          link.intent === 'recovery'
            ? 'That reset link is no longer valid. Request a new one.'
            : 'That confirmation link is no longer valid. Sign up again to get a new one.',
        );
      }
    };

    // Cold start (app opened by the link) and warm (already running).
    Linking.getInitialURL()
      .then(handle)
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLinkChecked(true);
      });
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handle(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Once signed in, register this device for push notifications (best-effort —
  // a null token, denied permission, or pre-EAS setup just means no push).
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    registerForPushNotificationsAsync()
      .then((token) => {
        if (alive && token) return api.updateMe({ expoPushToken: token });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading: loading || !linkChecked,
      signUp: async (email, password, name) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // Without this the confirmation link falls back to the project's Site
          // URL, which is why it used to dead-end on localhost.
          options: { data: { name: name.trim() }, emailRedirectTo: confirmRedirectTo() },
        });
        if (error) throw error;
        // With "Confirm email" ON in Supabase, no session is returned until confirmed.
        return { needsConfirmation: !data.session };
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: recoveryRedirectTo(),
        });
        if (error) throw error;
      },
      resendConfirmation: async (email) => {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: confirmRedirectTo() },
        });
        if (error) throw error;
      },
      authNotice,
      clearAuthNotice: () => setAuthNotice(null),
      recovery,
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        // The session stays valid, so clearing the flag lands them in the app.
        setRecovery({ active: false, error: null });
      },
      cancelRecovery: async () => {
        await supabase.auth.signOut();
        setRecovery({ active: false, error: null });
      },
    }),
    [session, loading, linkChecked, recovery, authNotice],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
