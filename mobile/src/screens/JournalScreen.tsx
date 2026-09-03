// =====================================================================
// JournalScreen - tutorials, field notes, and industry observations.
// Reads the shared `journal_posts` table (DB-first, same as the website)
// so both clients always show the same latest posts, with the bundled
// posts as an offline fallback.
// =====================================================================
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View, Pressable } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { LOCAL_JOURNAL_POSTS, type JournalPost } from '../config/journal'
import { getJournalPosts } from '../services/journalService'

export function JournalScreen() {
  const [posts, setPosts] = useState<JournalPost[]>(LOCAL_JOURNAL_POSTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const latest = await getJournalPosts()
        if (active) setPosts(latest)
      } catch {
        // fallback posts already set
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="px-5 pt-6">
        <Text className="text-xs font-black uppercase tracking-widest text-navy">Journal · signals and practice</Text>
        <Text className="mt-2 font-display text-3xl font-bold text-ink">Notes from the workbench.</Text>
        <Text className="mt-3 text-base leading-7 text-muted">Tutorials, field notes, and industry observations for people building a more useful future.</Text>
      </View>

      {loading ? (
        <View className="items-center py-12">
          <ActivityIndicator size="large" color="#1e3a8a" />
        </View>
      ) : (
        <View className="px-5 py-8 gap-4">
          {posts.map((post) => (
            <View key={post.id} className="border-t-2 border-ink bg-card p-5">
              <Text className="text-xs font-black uppercase tracking-widest text-navy">{post.tag}</Text>
              <Text className="mt-3 font-display text-xl font-bold text-ink">{post.title}</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">{post.text}</Text>
              <Pressable onPress={() => {}} className="mt-5 flex-row items-center gap-1.5">
                <Text className="text-sm font-bold text-navy underline">Get in touch about this</Text>
                <Feather name="external-link" size={12} color="#1e3a8a" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View className="mx-5 mb-8 rounded-2xl border-t border-b border-line bg-mist p-5">
        <Text className="text-xs font-black uppercase tracking-widest text-navy">Trend brief · August 2026</Text>
        <Text className="mt-3 font-display text-xl font-bold text-ink">The useful future is more human than the hype cycle.</Text>
        <Text className="mt-3 text-sm leading-6 text-muted">
          The World Economic Forum points to technology change and skills gaps as major forces through 2030. The International Federation of Robotics emphasizes that robots automate tasks, while skills development and training help people capture the benefits. UNESCO's digital education guidance keeps human agency, critical thinking, and ethics at the center of AI learning. That is the standard we are building toward.
        </Text>
        <View className="mt-4 flex-row flex-wrap gap-4">
          <Text className="text-xs font-bold text-navy underline">WEF Future of Jobs 2025</Text>
          <Text className="text-xs font-bold text-navy underline">IFR robotics research</Text>
          <Text className="text-xs font-bold text-navy underline">UNESCO digital education</Text>
        </View>
      </View>
    </ScrollView>
  )
}
