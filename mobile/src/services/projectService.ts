import { supabase } from '../config/supabase'

export interface Project {
  id: string
  name: string
  description: string
  mode_name: string
  category: string
  technologies: string[]
  control_method: string[]
  difficulty: string
  image_url?: string
  spec?: string
}

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('category', 'Robot Cars')
    .order('name', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data || null
}

export async function saveProject(project: Project): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .upsert(project)

  if (error) throw error
}