// =====================================================================
// AuthScreen - Supabase sign-in placeholder.
//
// TODO (implement_auth_flows):
//   - Use supabase.auth.signInWithPassword / signUp / signInWithOtp.
//   - Store the session in SecureStore or AsyncStorage.
//   - Add email/password inputs backed by real form state.
// =====================================================================
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLoginPlaceholder = () => {
    // PLAYLACEHOLDER: replace with supabase.auth.signInWithPassword(...)
    Alert.alert('Not implemented', 'Wire this to Supabase auth (see shared/supabase.ts).');
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <BrandHeader title="Sign In" subtitle="Placeholder Supabase authentication" />
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
          onPress={handleLoginPlaceholder}
          className="mt-6 items-center rounded-full bg-navy px-5 py-3"
        >
          <Text className="font-bold text-white">Sign In</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
