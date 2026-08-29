// =====================================================================
// SignInSheet - native sign-in bottom sheet. Preferred over the website's
// login page so sign-in feels instant and native.
//
//   Email/password  -> native Supabase signInWithPassword.
//   Google          -> opens the system browser (Chrome Custom Tab) for
//                      PKCE OAuth, since Google blocks OAuth inside the
//                      embedded WebView.
//
// On success the session is handed to the website via /api/auth/native-
// handoff and this sheet closes. "Create account" / "Forgot password"
// hand off to the website's login page tabs (mode=signup / mode=forgot).
// =====================================================================
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseConfigured, googleConfigured } from '../config/supabase';
import { useApp } from '../context/AppContext';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
};

export function SignInSheet({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
    authBusy,
    authError,
    signInWithPassword,
    signInWithGoogle,
    navigate,
    user,
  } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const closeDisabled = authBusy;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !authBusy;

  const handleClose = () => {
    if (closeDisabled) return;
    setEmail('');
    setPassword('');
    setShowPassword(false);
    onRequestClose();
  };

  const handlePasswordSubmit = () => {
    if (canSubmit) void signInWithPassword(email, password);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} disabled={closeDisabled} />

        <View
          style={{
            paddingBottom: Math.max(insets.bottom, 12),
            paddingTop: 18,
          }}
          className="rounded-t-3xl bg-white"
        >
          {/* grab handle */}
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />

          {/* Header */}
          <View className="flex-row items-start justify-between px-5">
            <View className="flex-1 pr-4">
              <Text className="font-display text-xl font-bold text-navy">Welcome back</Text>
              <Text className="mt-0.5 text-sm text-muted">
                Sign in to sync your build list and orders.
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={closeDisabled}
              accessibilityLabel="Close sign in"
              className="h-9 w-9 items-center justify-center rounded-full bg-mist"
            >
              <Feather name="x" size={18} color="#1e3a8a" />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16 }}
          >
            {!supabaseConfigured ? (
              <View className="mb-3 rounded-xl border border-line bg-mist px-4 py-3">
                <Text className="text-xs text-muted">
                  Native sign-in is not configured yet — use the sign-in link on the
                  website instead.
                </Text>
              </View>
            ) : null}

            {/* Email */}
            <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-border">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink"
            />

            {/* Password */}
            <Text className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-border">
              Password
            </Text>
            <View className="flex-row items-center rounded-xl border border-border bg-surface">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textContentType="password"
                accessibilityLabel="Password"
                onSubmitEditing={handlePasswordSubmit}
                className="flex-1 px-4 py-3 text-sm text-ink"
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                className="px-3 py-3"
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={17}
                  color="#64748b"
                />
              </Pressable>
            </View>

            {/* Error */}
            {authError ? (
              <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <Feather name="alert-circle" size={15} color="#dc2626" />
                <Text className="flex-1 text-xs font-medium text-red-600">{authError}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <Pressable
              onPress={() => void signInWithPassword(email, password)}
              disabled={!canSubmit}
              accessibilityRole="button"
              className={`mt-4 flex-row items-center justify-center rounded-xl py-3.5 ${
                canSubmit ? 'bg-navy' : 'bg-navy/40'
              }`}
            >
              {authBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-sm font-bold text-white">Sign in</Text>
              )}
            </Pressable>

            {/* Divider */}
            <View className="mt-5 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-line" />
              <Text className="text-[11px] font-bold uppercase tracking-widest text-border">
                or
              </Text>
              <View className="h-px flex-1 bg-line" />
            </View>

            {/* Google */}
            <Pressable
              onPress={() => void signInWithGoogle()}
              disabled={authBusy || !supabaseConfigured || !googleConfigured}
              accessibilityRole="button"
              className="mt-5 flex-row items-center justify-center rounded-xl border border-border bg-white py-3.5 disabled:opacity-60"
            >
              {authBusy ? (
                <ActivityIndicator size="small" color="#1e3a8a" />
              ) : (
                <>
                  <View className="h-5 w-5 items-center justify-center">
                    <Text className="text-base font-black leading-none text-[#4285F4]">G</Text>
                  </View>
                  <Text className="ml-2.5 text-sm font-bold text-ink">
                    Continue with Google
                  </Text>
                </>
              )}
            </Pressable>

            {/* Google sign-in notice */}
            {!googleConfigured && (
              <Text className="mt-2 text-xs text-muted">
                Google sign-in is being set up — use email & password instead.
              </Text>
            )}

            {/* Footer links */}
            <View className="mt-6 flex-row items-center justify-between">
              <Pressable
                onPress={() => {
                  handleClose();
                  navigate('/login?mode=signup');
                }}
                disabled={closeDisabled}
                accessibilityRole="button"
              >
                <Text className="text-xs font-bold text-navy underline">
                  Create account
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  handleClose();
                  navigate('/login?mode=forgot');
                }}
                disabled={closeDisabled}
                accessibilityRole="button"
              >
                <Text className="text-xs font-bold text-muted underline">
                  Forgot password?
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* Confirmation toast for a fresh native sign-in */}
          {user ? (
            <View className="mx-5 mt-3 flex-row items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5">
              <Feather name="check-circle" size={15} color="#059669" />
              <Text className="flex-1 text-xs font-medium text-emerald-700">
                Signed in as {user.email}
              </Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
});