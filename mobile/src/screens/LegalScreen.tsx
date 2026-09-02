// =====================================================================
// LegalScreen - Privacy Policy / Terms of Service (native mirror of the
// website's app/privacy and app/terms pages).
// =====================================================================
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { company } from '../config/company';
import type { RootStackParamList } from '../navigation/types';

type Route = RouteProp<RootStackParamList, 'Legal'>;

type Section = { title: string; blocks: string[] };

const PRIVACY_SECTIONS: Section[] = [
  {
    title: 'Who we are',
    blocks: [
      `${company.name} (${company.address}, PAN ${company.pan}) operates this website and is the controller of the personal data described below. Questions: ${company.email}`,
    ],
  },
  {
    title: 'Data we collect',
    blocks: [
      'Account data: name, email, and password (hashed by our authentication provider) when you create an account.',
      'Profile data: phone number and delivery address you add for order fulfilment.',
      'Order & payment data: items ordered, amounts, delivery details, and a payment reference from the gateway. We never see or store your full card numbers or eSewa/Khalti credentials.',
      'Messages: content you send through contact forms.',
      'Technical data: standard server logs (IP address, user agent) kept briefly for security.',
    ],
  },
  {
    title: 'How we use it',
    blocks: [
      'To create and manage your account and saved cart.',
      'To process orders, payments, deliveries, and refunds.',
      'To reply to inquiries and send service emails about your orders.',
      'To keep the site secure and prevent abuse.',
    ],
  },
  {
    title: 'Payment processors',
    blocks: [
      'Payments run through eSewa and Khalti under their own privacy policies. They receive only what is needed to complete the transaction.',
    ],
  },
  {
    title: 'Sharing',
    blocks: [
      'We share data only with payment gateways and delivery couriers as needed to fulfil your order, and with authorities where the law requires. We do not sell personal data.',
    ],
  },
  {
    title: 'Retention',
    blocks: [
      'Order records are kept for tax and accounting purposes as required by Nepali law. You can delete your account at any time; we will remove profile data except records we must retain by law.',
    ],
  },
  {
    title: 'Your rights',
    blocks: [
      'You may request access to, correction of, or deletion of your personal data by emailing us. Individual Privacy Act 2018 (Nepal) rights apply.',
    ],
  },
  {
    title: 'Cookies',
    blocks: [
      'We use a session cookie for sign-in, a cart cookie/localStorage entry, and an optional theme preference stored locally. No advertising trackers.',
    ],
  },
];

const TERMS_SECTIONS: Section[] = [
  {
    title: 'Agreement',
    blocks: [
      `By ordering from this website you agree to these terms with ${company.name} (${company.address}, PAN ${company.pan}).`,
    ],
  },
  {
    title: 'Orders and pricing',
    blocks: [
      'All prices are in Nepali Rupees (NPR) and include applicable taxes unless stated otherwise.',
      'An order is a request to buy; it becomes binding when we confirm it by email or dispatch the goods.',
      'Project packages and training marked "quote" are priced individually after scoping.',
    ],
  },
  {
    title: 'Payments',
    blocks: [
      'We accept eSewa, Khalti, and cash on delivery inside Kathmandu Valley.',
      'Online orders are charged at checkout. COD orders are payable in full on delivery.',
      'Failed or cancelled online payments leave the order unpaid; nothing is reserved until payment succeeds.',
    ],
  },
  {
    title: 'Delivery',
    blocks: [
      'In-stock items usually dispatch within 1–2 working days.',
      'Kathmandu Valley delivery is free above NPR 5,000; elsewhere courier charges apply and are confirmed before shipping.',
      'Risk passes to you on delivery. Inspect packages before signing where possible.',
    ],
  },
  {
    title: 'Warranty and returns',
    blocks: [
      'Retail components carry a 7-day replacement warranty for manufacturing defects.',
      'Returns require original packaging and proof of purchase; contact us first for an authorisation.',
      'Physical damage, water damage, burnt boards, or misuse void the warranty.',
      'Digital products (curricula, files) are non-returnable once downloaded.',
    ],
  },
  {
    title: 'Training programs',
    blocks: [
      'Workshop dates may shift for reasons beyond our control; we will reschedule rather than cancel where possible. School pilot agreements are governed by the signed proposal document.',
    ],
  },
  {
    title: 'Acceptable use',
    blocks: [
      'Do not attempt to breach site security, scrape at scale, resell curricula without licence, or place fraudulent orders.',
    ],
  },
  {
    title: 'Liability',
    blocks: [
      'To the extent permitted by law, our liability for any claim is limited to the amount you paid for the affected order.',
    ],
  },
  {
    title: 'Changes and governing law',
    blocks: [
      'We may update these terms; the version in force is the one published when you order. These terms are governed by the laws of Nepal, courts of Kathmandu.',
    ],
  },
];

export function LegalScreen() {
  const { doc } = useRoute<Route>().params;
  const isPrivacy = doc === 'privacy';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text className="text-[10px] font-black uppercase tracking-[0.24em] text-navy">Legal</Text>
      <Text className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">
        {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
      </Text>
      <Text className="mt-2 text-sm text-muted">Last updated: August 2026</Text>

      <View className="mt-8">
        {sections.map((section) => (
          <View key={section.title} className="mb-8">
            <Text className="font-display text-xl font-bold text-ink">{section.title}</Text>
            <View className="mt-3">
              {section.blocks.map((block) => (
                <View key={block} className="mb-3 flex-row items-start gap-2">
                  <View className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  <Text className="flex-1 text-sm leading-7 text-muted">{block}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}