// =====================================================================
// programsService - reads the shared `training_programs`,
// `pilot_cost_lines`, and `curriculum_highlights` Supabase tables (the
// SAME tables the website's programs-store reads) so the app and the
// website always show the same latest programs / pilot costs /
// curriculum content. Falls back to the bundled config/programs.ts when
// Supabase is not configured or unreachable.
//
// RLS: all three tables have a public-read policy, so the app's anon key
// can SELECT without a session.
// =====================================================================
import { supabase, supabaseConfigured } from '../config/supabase'
import {
  pilotCosts as fallbackPilotCosts,
  stemProjectHighlights as fallbackHighlights,
  trainingPrograms as fallbackPrograms,
} from '../config/programs'

export type TrainingProgram = {
  title: string
  audience: string
  description: string
  duration: string
  outcome: string
}

export type PilotCostLine = [item: string, cost: string, note: string]

export type CurriculumHighlights = Record<string, string[]>

export type ProgramsContent = {
  trainingPrograms: TrainingProgram[]
  pilotCosts: PilotCostLine[]
  stemProjectHighlights: CurriculumHighlights
}

async function fetchTrainingPrograms(): Promise<TrainingProgram[]> {
  if (!supabaseConfigured) return fallbackPrograms
  try {
    const { data, error } = await supabase
      .from('training_programs')
      .select('title, audience, description, duration, outcome')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) return fallbackPrograms
    return data.map((row) => ({
      title: row.title,
      audience: row.audience ?? '',
      description: row.description ?? '',
      duration: row.duration ?? '',
      outcome: row.outcome ?? '',
    }))
  } catch {
    return fallbackPrograms
  }
}

async function fetchPilotCosts(): Promise<PilotCostLine[]> {
  // The bundled config is an array of 3-element rows; narrow it to the tuple type.
  const fallback = fallbackPilotCosts as PilotCostLine[]
  if (!supabaseConfigured) return fallback
  try {
    const { data, error } = await supabase
      .from('pilot_cost_lines')
      .select('item, cost, note')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) return fallback
    return data.map((row) => [row.item, row.cost ?? '', row.note ?? ''] as PilotCostLine)
  } catch {
    return fallback
  }
}

async function fetchHighlights(): Promise<CurriculumHighlights> {
  if (!supabaseConfigured) return fallbackHighlights
  try {
    const { data, error } = await supabase
      .from('curriculum_highlights')
      .select('age_band, items')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) return fallbackHighlights
    const highlights: CurriculumHighlights = {}
    for (const row of data) {
      if (row.age_band) highlights[row.age_band] = Array.isArray(row.items) ? (row.items as string[]) : []
    }
    return Object.keys(highlights).length > 0 ? highlights : fallbackHighlights
  } catch {
    return fallbackHighlights
  }
}

/** Fetch all programs content DB-first (per-list fallback to bundled config). */
export async function getProgramsContent(): Promise<ProgramsContent> {
  const [trainingPrograms, pilotCosts, stemProjectHighlights] = await Promise.all([
    fetchTrainingPrograms(),
    fetchPilotCosts(),
    fetchHighlights(),
  ])
  return { trainingPrograms, pilotCosts, stemProjectHighlights }
}
