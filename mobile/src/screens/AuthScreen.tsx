// =====================================================================
// AuthScreen - Supabase email/password authentication.
//
// Modes:
//   "signin" - sign in with an existing account.
//   "signup" - create a new account (email confirmation may be required).
//   "signedout" - show signed-out hint text.
// On success the session is persisted and `onAuthed()` is called so the
// app re-renders (App.tsx shows the home screen).
// =====================================================================
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { AuthService } from '../services/AuthService';

type Mode = 'signin' | 'signup' | 'signedout';

type Props = {
  onAuthed: () => void;
  onSignedOut: () => void;
};

export function AuthScreen({ onAuthed, onSignedOut }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Show the signed-in user's email once the session is restored.
    AuthService.getUserEmail().then((mail) => {
      if (mail) {
        setMode('signedout');
        setEmail(mail);
      }
    });
  }, []);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Missing fields', 'Enter both email and password.');
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === 'signin'
          ? await AuthService.signIn(trimmedEmail, password)
          : await AuthService.signUp(trimmedEmail, password);

      if (!result.ok) {
        Alert.alert('Auth error', result.message ?? 'Something went wrong.');
        return;
      }
      if (result.needsEmailConfirmation) {
        Alert.alert('Check your email', 'Confirm your email address, then sign in.');
        setMode('signin');
        return;
      }
      onAuthed();
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await AuthService.signOut();
    setMode('signin');
    setEmail('');
    setPassword('');
    onSignedOut();
  };

  if (mode === 'signedout') {
    return (
      <ScrollView className="flex-1 bg-mist">
        <BrandHeader title="Account" subtitle="Signed in" />
        <View className="p-5">
          <Text className="text-base text-ink">Signed in as: {email}</Text>
          <Pressable
            onPress={handleSignOut}
            className="mt-6 items-center rounded-full border border-line bg-surface px-5 py-3"
          >
            <Text className="font-bold text-muted">Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const isSignup = mode === 'signup';

  return (
    <ScrollView className="flex-1 bg-mist">
      <BrandHeader
        title={isSignup ? 'Sign Up' : 'Sign In'}
        subtitle="Supabase email & password"
      />
      <View className="p-5">
        <Text className="text-sm font-semibold text-ink">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          className="mt-1 rounded-lg border border-line bg-surface px-4 py-3"
        />
        <Text className="mt-4 text-sm font-semibold text-ink">Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          className="mt-1 rounded-lg border border-line bg-surface px-4 py-3"
        />
        <Pressable
          onPress={handleSubmit}
          disabled={busy}
          className="mt-6 items-center rounded-full bg-navy px-5 py-3"
        >
          <Text className="font-bold text-white">
            {busy ? 'Please wait…' : isSignup ? 'Create Account' : 'Sign In'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode(isSignup ? 'signin' : 'signup')} className="mt-4 items-center">
          <Text className="text-sm font-semibold text-navy">
            {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
