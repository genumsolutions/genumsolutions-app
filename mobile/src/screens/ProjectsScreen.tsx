'use client'

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  RefreshControl,
  Platform,
} from 'react-native'
import { useSupachema } from '../contexts/AppContext'
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useToast } from '@/components/ui/use-toast'
import { getProjects, getProject, Project } from '../services/projectService'

interface ProjectsScreenProps {
  visible: boolean
  onClose: () => void
}

export function ProjectsScreen({ visible, onClose }: ProjectsScreenProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { user } = useSupachema()
  const navigation = useNavigation()
  const route = useRoute()
  const { toast } = useToast()

  useEffect(() => {
    async function fetchProjects() {
      try {
        const result = await getProjects()
        setProjects(result)
      } catch (e) {
        console.error('Failed to fetch projects', e)
        toast({
          title: 'Error',
          description: 'Failed to load projects. Showing offline data.',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
        if (refreshing) setRefreshing(false)
      }
    }
    fetchProjects()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchProjects()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    )
  }

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color="currentColor"
              onPress={onClose}
            />
          </View>
          <Text style={styles.headerTitle}>Robo Car Projects</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.content}>
          {user
            ? (
              <FlatList
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor="primary"
                  />
                }
                data={projects}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.projectItem}
                    onPress={() => handleProjectPress(item)}
                  >
                    <View style={styles.projectLeft}>
      <MaterialCommunityIcons
        name="robot"
        size={32}
        color={getModeColor(item.mode_name)}
      />
      <Text style={styles.projectModeBadge>{item.mode_name}</Text>
                    </View>
                    <View style={styles.projectRight}>
                      <Text style={styles.projectName}>{item.name}</Text>
                      <Text style={styles.projectDescription}>
                        {item.description}
                      </Text>
                      <Text style={styles.projectTech}>
                        Tech: {item.technologies.join(', ')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id}
              />
            )
            : (
              <View style={styles.noUserView}>
                <Text style={styles.noUserText}>
                  Sign in to view projects
                </Text>
                <TouchableOpacity
                  style={styles.signInBtn}
                  onPress={() => navigation.navigate('SignIn')}
                >
                  <Text style={styles.signInText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

function getModeColor(mode: string): string {
  const colors: Record<string, string> = {
    '4wd4m': 'indigo',
    '2wd1m': 'green',
    'self-balancing': 'purple',
    'obstacle-us': 'red',
    'obstacle-ir': 'orange',
    'website-client': 'orange',
    'website-server': 'orange',
    'path-follow': 'teal',
    'rf-manual': 'amber',
  }
  return colors[mode] || 'gray'
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalContainer: {
    height: '100%',
    maxHeight: Platform.OS === 'android' ? '90%' : '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: 'white',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  content: {
    padding: 16,
    flex: 1,
  },
  noUserView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    textAlign: 'center',
  },
  noUserText: {
    color: '#64748b',
    fontSize: 16,
  },
  signInBtn: {
    marginTop: 16,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  signInText: {
    color: 'white',
    fontWeight: '500',
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  projectLeft: {
    paddingRight: 12,
  },
  projectModeBadge: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
    minWidth: 36,
    textAlign: 'center',
  },
  projectRight: {
    flex: 1,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  projectTech: {
    fontSize: 11,
    color: '#94a3b8',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8f9fa',
  },
  closeBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'center',
  },
  closeText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
  },
})