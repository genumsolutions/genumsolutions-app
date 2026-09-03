// =====================================================================
// SignInSheet - native sign-in / sign-up / forgot-password bottom sheet.
// All auth goes directly to Supabase (no WebView involved).
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

type Mode = 'signin' | 'signup' | 'forgot';

export function SignInSheet({ visible, onRequestClose }: Props) {
  const insets = useSafeAreaInsets();
  const { authBusy, authError, signInWithPassword, signUp, signInWithGoogle, resetPassword } =
    useApp();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const closeDisabled = authBusy;

  const handleClose = () => {
    if (closeDisabled) return;
    resetForm();
    onRequestClose();
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setNotice(null);
    setMode('signin');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
  };

  const canSubmit =
    mode === 'forgot'
      ? email.trim().length > 0 && !authBusy
      : email.trim().length > 0 && password.length > 0 && !authBusy;

  const handlePrimary = async () => {
    if (mode === 'signin') {
      const ok = await signInWithPassword(email, password);
      if (ok) resetForm();
    } else if (mode === 'signup') {
      const result = await signUp(name, email, password);
      if (result === 'ok') resetForm();
      else if (result === 'confirm') setNotice('Check your email to confirm your account.');
    } else {
      const ok = await resetPassword(email);
      if (ok) {
        setNotice('If that email exists, a reset link has been sent.');
        switchMode('signin');
      }
    }
  };

  const title =
    mode === 'signin'
      ? 'Welcome back'
      : mode === 'signup'
        ? 'Create account'
        : 'Reset password';

  const subtitle =
    mode === 'signin'
      ? 'Sign in to sync your build list and orders.'
      : mode === 'signup'
        ? 'Create an account to place orders.'
        : 'We’ll email you a link to reset your password.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 40}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} disabled={closeDisabled} />

        <View
          style={{ paddingBottom: Math.max(insets.bottom, 12), paddingTop: 18 }}
          className="rounded-t-3xl bg-card"
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />

          <View className="flex-row items-start justify-between px-5">
            <View className="flex-1 pr-4">
              <Text className="font-display text-xl font-bold tracking-tight text-navy">{title}</Text>
              <Text className="mt-0.5 text-sm text-muted">{subtitle}</Text>
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

          {/* Mode tabs */}
          <View className="mx-5 mt-4 flex-row rounded-full bg-mist p-1">
            {(
              [
                ['signin', 'Sign in'],
                ['signup', 'Create'],
                ['forgot', 'Reset'],
              ] as [Mode, string][]
            ).map(([m, label]) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => switchMode(m)}
                  disabled={closeDisabled}
                  className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-card' : ''}`}
                >
                  <Text className={`text-xs font-bold ${active ? 'text-navy' : 'text-muted'}`}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16 }}
          >
            {!supabaseConfigured ? (
              <View className="mb-3 rounded-xl border border-line bg-mist px-4 py-3">
                <Text className="text-xs text-muted">
                  Sign-in is not configured in this build yet.
                </Text>
              </View>
            ) : null}

            {mode === 'signup' ? (
              <>
                <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-border">
                  Full name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor="#94a3b8"
                  autoCorrect={false}
                  accessibilityLabel="Full name"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink"
                />
              </>
            ) : null}

            <Text className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-border">
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

            {mode !== 'forgot' ? (
              <>
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
                    textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                    accessibilityLabel="Password"
                    onSubmitEditing={() => void handlePrimary()}
                    className="flex-1 px-4 py-3 text-sm text-ink"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    className="px-3 py-3"
                  >
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color="#64748b" />
                  </Pressable>
                </View>
              </>
            ) : null}

            {notice ? (
              <View className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <Text className="text-xs font-medium text-emerald-700">{notice}</Text>
              </View>
            ) : null}

            {authError ? (
              <View className="mt-3 flex-row items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <Feather name="alert-circle" size={15} color="#dc2626" />
                <Text className="flex-1 text-xs font-medium text-red-600">{authError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void handlePrimary()}
              disabled={!canSubmit}
              accessibilityRole="button"
              className={`mt-4 flex-row items-center justify-center rounded-xl py-3.5 ${canSubmit ? 'bg-navy' : 'bg-navy/40'}`}
            >
              {authBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-sm font-bold text-white">
                  {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
                </Text>
              )}
            </Pressable>

            {mode === 'signin' && supabaseConfigured && googleConfigured ? (
              <>
                <View className="mt-5 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-line" />
                  <Text className="text-xs font-bold uppercase tracking-widest text-border">or</Text>
                  <View className="h-px flex-1 bg-line" />
                </View>
                <Pressable
                  onPress={() => void signInWithGoogle()}
                  disabled={authBusy}
                  accessibilityRole="button"
                  className="mt-5 flex-row items-center justify-center rounded-xl border border-border bg-card py-3.5 disabled:opacity-60"
                >
                  {authBusy ? (
                    <ActivityIndicator size="small" color="#1e3a8a" />
                  ) : (
                    <>
                      <View className="h-5 w-5 items-center justify-center">
                        <Text className="text-base font-black leading-none text-[#4285F4]">G</Text>
                      </View>
                      <Text className="ml-2.5 text-sm font-bold text-ink">Continue with Google</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : null}
          </ScrollView>
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
