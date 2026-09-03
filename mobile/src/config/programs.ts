// =====================================================================
// programs - training programs, pilot costs, and STEM project highlights
// used as the OFFLINE FALLBACK for the native home screen (the DB-first
// read lives in services/programsService.ts). Kept in sync with the
// website's lib/programs-data.ts, which also seeds the DB tables.
// =====================================================================

export const trainingPrograms = [
  { title: 'K–5 Robotics Foundations', audience: 'Elementary schools · 3-classroom pilot', description: 'ESP32 starter kits, grade-mapped lessons, teacher training, coaching, and a pilot report for 30 student kits.', duration: '13-week pilot + months 4–12 support', outcome: '30 kits · 36 curriculum units · measurable pilot report' },
  { title: 'STEM Master Package', audience: 'Schools, NGOs, workshops, and private clients', description: 'A reusable package combining the 100+ project catalog, curriculum guide, robotics manuals, six-stream activities, presentation material, and implementation notes.', duration: 'Digital delivery or workshop deployment', outcome: 'Age-banded projects · teacher notes · demos · assessment prompts' },
  { title: 'ESP32 Robotics Lab', audience: 'Clubs, makerspaces, and secondary learners', description: 'Build and test modular robot cars across Bluetooth, Wi-Fi, OLED, path following, and obstacle avoidance modes.', duration: 'Half-day to multi-session lab', outcome: 'Working build · firmware workflow · safety and troubleshooting practice' },
  { title: 'Teacher Enablement Workshop', audience: 'Up to 6 teachers per workshop', description: 'Assembly, classroom management, lesson delivery, assessment, and practical troubleshooting using the GENUM kit system.', duration: 'One full day + two virtual coaching sessions', outcome: 'Teacher confidence target ≥ 4/5 · first lesson delivered' },
]

export const pilotCosts = [
  ['30 classroom kits', 'NPR 3,60,000', '10 kits per classroom × 3 classrooms at the illustrative bulk rate'],
  ['Storage and charging', 'NPR 40,000', 'Caddies, charging or USB hub, and spare-parts handling'],
  ['Shipping and handling', 'NPR 26,000', 'Valley delivery included; nationwide courier confirmed by destination'],
  ['On-site teacher workshop', 'NPR 1,60,000', 'One full-day session for up to 6 teachers'],
  ['Virtual coaching', 'NPR 54,000', 'Two 90-minute sessions in months 1 and 3'],
  ['Curriculum subscription', 'NPR 72,000', '12 months × 3 classrooms × NPR 2,000 per classroom/month'],
  ['Dashboard and secure relay setup', 'NPR 48,000', 'One-time setup for lesson distribution and oversight'],
  ['Pilot support and report', 'NPR 80,000', 'Coordination, data collection, feedback, and recommendations'],
]

export const stemProjectHighlights: Record<string, string[]> = {
  'Ages 5–7': ['Baking soda volcano', 'Rainbow walking water', 'Balloon rocket', 'Paper helicopter'],
  'Ages 8–10': ['Lemon battery', 'Paper circuit card', 'Bristlebot', 'Scratch maze game'],
  'Ages 11–12': ['Light-following robot', 'Soil moisture alarm', 'Line-following robot', 'Weather station'],
}