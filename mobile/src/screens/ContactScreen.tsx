// =====================================================================
// ContactScreen - company contact details + native inquiry form.
// Form posts via the /contact edge function (persists to customer_messages
// and emails GENUM via Resend), reads up to the website's ContactForm.
// =====================================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { company as fallbackCompany } from '../config/company';
import { getCompany } from '../services/companyService';
import { sendContactInquiry } from '../services/orderService';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Main'>;

export function ContactScreen() {
  const navigation = useNavigation<Nav>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  // Contact details come from the shared company_info table (bundled copy as
  // fallback until the read resolves) so app and website stay in sync.
  const [company, setCompany] = useState(fallbackCompany);

  useEffect(() => {
    let active = true;
    getCompany()
      .then((c) => { if (active) setCompany(c); })
      .catch(() => { /* keep bundled fallback */ });
    return () => { active = false; };
  }, []);

  async function submit() {
    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus({ text: 'Please complete all fields.', isError: true });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus({ text: 'Please check your email address.', isError: true });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      await sendContactInquiry(name.trim(), email.trim(), message.trim());
      setStatus({ text: 'Thanks. Your inquiry has been sent.', isError: false });
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setStatus({ text: 'We could not send your inquiry right now. Please email us directly.', isError: true });
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text className="text-xs font-black uppercase tracking-[0.24em] text-navy">Contact</Text>
        <Text className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">Get in touch</Text>

        <View className="mt-4 space-y-3">
          <Row
            icon="map-pin"
            label="Address"
            value={company.address}
            onPress={() => void Linking.openURL('geo:0,0?q=' + encodeURIComponent(company.address))}
          />
          <Row
            icon="mail"
            label="Email"
            value={company.email}
            onPress={() => void Linking.openURL(`mailto:${company.email}`)}
          />
          <Row
            icon="phone"
            label="Phone"
            value={company.phone}
            onPress={() => void Linking.openURL(`tel:${company.phone.replace(/\s/g, '')}`)}
          />
        </View>

        {/* Inquiry form */}
        <View className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-card">
          <Text className="font-display text-lg font-bold text-ink">Send an inquiry</Text>
          <Text className="mt-1 text-sm leading-5 text-muted">
            Tell us what you are working on and we will reply by email.
          </Text>

          <Text className="mt-4 text-sm font-bold text-ink">Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#94a3b8"
            maxLength={100}
            autoCapitalize="words"
            className="mt-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
          />

          <Text className="mt-3 text-sm font-bold text-ink">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#94a3b8"
            maxLength={254}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            className="mt-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
          />

          <Text className="mt-3 text-sm font-bold text-ink">Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="What are you working on?"
            placeholderTextColor="#94a3b8"
            maxLength={5000}
            multiline
            numberOfLines={6}
            style={{ textAlignVertical: 'top' }}
            className="mt-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink"
          />

          <Pressable
            onPress={submit}
            disabled={sending}
            className="mt-4 flex-row items-center h-12 items-center justify-center rounded-xl bg-navy px-5 disabled:opacity-60"
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-sm font-black text-white">Send inquiry</Text>
            )}
          </Pressable>

          {status && (
            <Text className={`mt-3 text-sm font-semibold ${status.isError ? 'text-red-600' : 'text-emerald-700'}`}>
              {status.text}
            </Text>
          )}
        </View>

        {/* Legal links */}
        <View className="mt-8 flex-row items-center justify-center gap-3">
          <Pressable onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}>
            <Text className="text-sm font-bold text-navy underline">Privacy Policy</Text>
          </Pressable>
          <Text className="text-sm text-border">·</Text>
          <Pressable onPress={() => navigation.navigate('Legal', { doc: 'terms' })}>
            <Text className="text-sm font-bold text-navy underline">Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: 'map-pin' | 'mail' | 'phone';
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-start rounded-2xl border border-line bg-card p-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-navy-light">
        <Feather name={icon} size={18} color="#1e3a8a" />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-xs font-bold uppercase tracking-wide text-border">{label}</Text>
        <Text className="mt-0.5 text-sm font-semibold text-ink">{value}</Text>
      </View>
      <Feather name="external-link" size={16} color="#94a3b8" />
    </Pressable>
  );
}