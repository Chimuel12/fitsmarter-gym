// FitSmarter: what every catalogue exercise is measured against. Part of this AGPL fork.
//
// FAMILIES: one strength table per movement, from Strength Level's community standards
// (strengthlevel.com/strength-standards, 2014–2026, all body weights): the 1RM of men and women at
// the 5th, 20th, 50th, 80th and 95th percentile (Beginner … Elite), or the most reps for body-weight
// moves. They are turned into the app's anchors once, here: 10-rep weights (a 1RM × 0.75, Epley)
// at the top 90 / 80 / 50 / 20 / 5 %. A table's own spread is kept: a hack squat machine grows
// faster from beginner to elite than a back squat, so no single ratio to the squat fits it.
//
// familyOf(exercise): which table, a ratio for variants, whether the weight is one dumbbell, and
// how sure that is: 'direct' (the exercise is the table's own lift), 'variant' (a close relative,
// with a ratio), 'estimate' (only the main muscle and the equipment were known), or no rating at
// all (sled pushes, carries, bands, throws: the weight does not say how strong you are).
import { exerciseOf } from '../lib/exercises.js'
import { musclesOf } from '../lib/muscles.js'

// [lever (height effect), men's 1RM or reps at p5/p20/p50/p80/p95, women's, reps?, source slug]
const SL = {
  squat: [-0.15, [66, 95, 131, 173, 219], [32, 51, 76, 105, 137], 0, 'squat'],
  frontSquat: [-0.15, [54, 77, 105, 137, 172], [31, 45, 63, 83, 104], 0, 'front-squat'],
  hackMachine: [-0.15, [58, 99, 152, 217, 289], [26, 53, 92, 142, 200], 0, 'hack-squat'],
  hackBarbell: [-0.15, [48, 81, 124, 176, 235], [21, 40, 65, 96, 132], 0, 'barbell-hack-squat'],
  legPressSled: [-0.1, [96, 153, 227, 316, 414], [52, 94, 151, 222, 302], 0, 'sled-leg-press'],
  legPressHoriz: [-0.1, [66, 110, 168, 238, 316], [41, 71, 112, 162, 219], 0, 'horizontal-leg-press'],
  smithSquat: [-0.15, [48, 76, 112, 154, 202], [22, 39, 62, 90, 122], 0, 'smith-machine-squat'],
  goblet: [-0.1, [14, 25, 40, 58, 79], [10, 17, 26, 37, 50], 0, 'goblet-squat'],
  lungeDb: [-0.1, [8, 17, 28, 44, 61], [6, 11, 19, 28, 39], 0, 'dumbbell-lunge'],
  bulgarianDb: [-0.1, [11, 20, 31, 46, 62], [7, 13, 20, 30, 41], 0, 'dumbbell-bulgarian-split-squat'],
  legExt: [0, [43, 68, 99, 137, 179], [23, 39, 61, 88, 119], 0, 'leg-extension'],
  legCurlSeated: [0, [35, 55, 80, 110, 143], [20, 32, 49, 69, 92], 0, 'seated-leg-curl'],
  legCurlLying: [0, [26, 43, 63, 89, 116], [15, 25, 37, 53, 70], 0, 'lying-leg-curl'],
  calfMachine: [0, [43, 82, 137, 205, 284], [22, 49, 89, 140, 200], 0, 'machine-calf-raise'],
  calfSeated: [0, [28, 54, 91, 137, 190], [15, 35, 66, 106, 154], 0, 'seated-calf-raise'],
  hipThrust: [0.1, [45, 85, 140, 208, 286], [35, 64, 102, 149, 203], 0, 'hip-thrust'],
  adduction: [0, [38, 64, 99, 142, 190], [23, 42, 67, 98, 133], 0, 'hip-adduction'],
  abduction: [0, [34, 59, 92, 132, 178], [27, 46, 71, 102, 136], 0, 'hip-abduction'],
  deadlift: [0.2, [80, 113, 154, 202, 253], [41, 63, 91, 124, 160], 0, 'deadlift'],
  sumo: [0.1, [90, 125, 168, 217, 269], [48, 69, 95, 125, 158], 0, 'sumo-deadlift'],
  rdl: [0.2, [58, 87, 122, 164, 210], [31, 48, 68, 93, 120], 0, 'romanian-deadlift'],
  goodMorning: [0.2, [27, 52, 86, 129, 178], [16, 29, 46, 68, 92], 0, 'good-morning'],
  powerClean: [0, [46, 65, 87, 113, 141], [28, 39, 53, 69, 86], 0, 'power-clean'],
  bench: [-0.25, [49, 70, 96, 127, 160], [19, 33, 51, 72, 97], 0, 'bench-press'],
  inclineBench: [-0.25, [43, 63, 86, 114, 144], [15, 27, 43, 63, 85], 0, 'incline-bench-press'],
  declineBench: [-0.25, [52, 76, 105, 140, 178], [20, 35, 54, 79, 106], 0, 'decline-bench-press'],
  closeGrip: [-0.25, [49, 69, 93, 122, 152], [21, 34, 50, 70, 92], 0, 'close-grip-bench-press'],
  smithBench: [-0.25, [45, 65, 90, 120, 152], [17, 29, 46, 67, 90], 0, 'smith-machine-bench-press'],
  dbBench: [-0.25, [17, 26, 38, 53, 69], [7, 13, 20, 30, 40], 0, 'dumbbell-bench-press'],
  inclineDbBench: [-0.25, [19, 27, 38, 50, 64], [8, 13, 20, 28, 38], 0, 'incline-dumbbell-bench-press'],
  chestPress: [-0.2, [34, 56, 86, 121, 161], [11, 22, 37, 57, 79], 0, 'chest-press'],
  machineFly: [0, [37, 58, 85, 118, 154], [13, 24, 40, 59, 80], 0, 'machine-chest-fly'],
  dbFly: [0, [7, 14, 23, 34, 48], [4, 7, 12, 18, 24], 0, 'dumbbell-fly'],
  cableFly: [0, [7, 18, 35, 57, 84], [4, 10, 19, 31, 45], 0, 'cable-fly'],
  ohp: [-0.25, [29, 44, 62, 84, 107], [13, 21, 33, 46, 61], 0, 'shoulder-press'],
  dbOhp: [-0.25, [13, 21, 30, 42, 55], [6, 10, 15, 21, 28], 0, 'dumbbell-shoulder-press'],
  machineOhp: [-0.2, [25, 45, 73, 108, 148], [8, 18, 31, 49, 70], 0, 'machine-shoulder-press'],
  lateral: [0, [4, 9, 16, 24, 34], [3, 6, 9, 13, 18], 0, 'dumbbell-lateral-raise'],
  frontRaise: [0, [4, 9, 17, 27, 39], [3, 6, 9, 14, 20], 0, 'dumbbell-front-raise'],
  facePull: [0, [14, 27, 45, 68, 95], [11, 20, 33, 49, 68], 0, 'face-pull'],
  bbShrug: [0, [47, 81, 126, 182, 244], [18, 38, 67, 105, 148], 0, 'barbell-shrug'],
  dbShrug: [0, [14, 26, 42, 62, 85], [7, 14, 25, 39, 54], 0, 'dumbbell-shrug'],
  row: [0, [43, 62, 87, 116, 147], [18, 30, 44, 62, 82], 0, 'bent-over-row'],
  dbRow: [0, [17, 27, 42, 59, 78], [9, 14, 22, 30, 40], 0, 'dumbbell-row'],
  pulldown: [0, [42, 60, 82, 107, 134], [23, 34, 47, 63, 80], 0, 'lat-pulldown'],
  cableRow: [0, [41, 60, 84, 112, 142], [22, 33, 48, 65, 84], 0, 'seated-cable-row'],
  machineRow: [0, [41, 67, 100, 141, 186], [21, 35, 53, 75, 100], 0, 'machine-row'],
  tbar: [0, [33, 54, 81, 113, 148], [15, 28, 44, 65, 88], 0, 't-bar-row'],
  curl: [0, [19, 30, 45, 62, 82], [8, 15, 24, 36, 50], 0, 'barbell-curl'],
  ezCurl: [0, [22, 33, 45, 60, 76], [11, 18, 27, 37, 49], 0, 'ez-bar-curl'],
  dbCurl: [0, [7, 13, 21, 31, 42], [4, 7, 12, 18, 25], 0, 'dumbbell-curl'],
  hammer: [0, [9, 15, 23, 32, 43], [5, 8, 12, 18, 23], 0, 'hammer-curl'],
  preacher: [0, [18, 29, 43, 60, 79], [9, 16, 25, 37, 50], 0, 'preacher-curl'],
  cableCurl: [0, [17, 31, 49, 71, 97], [8, 15, 25, 38, 53], 0, 'cable-bicep-curl'],
  wristCurl: [0, [6, 19, 41, 71, 109], [1, 9, 24, 46, 74], 0, 'wrist-curl'],
  pushdown: [0, [19, 34, 54, 79, 107], [9, 18, 30, 45, 62], 0, 'tricep-pushdown'],
  ropePushdown: [0, [15, 27, 44, 65, 89], [8, 15, 25, 37, 51], 0, 'tricep-rope-pushdown'],
  skull: [0, [17, 28, 42, 59, 78], [7, 13, 21, 31, 42], 0, 'lying-tricep-extension'],
  dbTriExt: [0, [5, 11, 20, 33, 47], [3, 7, 12, 18, 25], 0, 'dumbbell-tricep-extension'],
  cableCrunch: [0, [23, 41, 65, 95, 128], [16, 29, 48, 72, 98], 0, 'cable-crunch'],
  pullup: [-0.3, [0.5, 7, 13, 21, 30], [0.5, 0.5, 6, 12, 19], 1, 'pull-ups'],
  chinup: [-0.3, [1, 7, 13, 21, 30], [0.5, 1, 6, 11, 17], 1, 'chin-ups'],
  dip: [-0.2, [3, 10, 20, 31, 43], [0.5, 1, 9, 18, 29], 1, 'dips'],
  pushup: [-0.2, [5, 19, 39, 62, 87], [0.5, 7, 18, 31, 47], 1, 'push-ups'],
  backExt: [0, [4, 15, 29, 45, 63], [5, 13, 24, 36, 49], 1, 'back-extension'],
}
// No public table: kept from the app's first version (10-rep anchors, an 80 kg man; women × fem).
const OWN = {
  legraise: { m: [3, 6, 12, 18, 25], fem: 0.7, reps: true, lever: 0 },
  bwlegs: { m: [10, 15, 25, 35, 50], fem: 0.85, reps: true, lever: 0 },
}
// p5 → p10 on the normal curve, log-linear like percentileOf: (z10 − z5) / (z20 − z5)
const P10 = (-1.2816 + 1.645) / (-0.8416 + 1.645)
const anchors = (raw, reps) => {
  const v = raw.map(x => Math.max(x, 0.5)), p10 = Math.exp(Math.log(v[0]) + P10 * (Math.log(v[1]) - Math.log(v[0])))
  return [p10, ...v.slice(1)].map(x => Math.round(x * (reps ? 1 : 0.75) * 10) / 10)
}
/** { key: { m, f, reps, lever, src } }: anchors at the top 90 / 80 / 50 / 20 / 5 %. */
export const FAMILIES = Object.fromEntries([
  ...Object.entries(SL).map(([k, [lever, m, f, reps, src]]) => [k, { m: anchors(m, reps), f: anchors(f, reps), reps: !!reps, lever, src }]),
  ...Object.entries(OWN).map(([k, v]) => [k, { ...v, src: null }]),
])
// families whose table is one dumbbell in one hand (the rest: the whole load)
const PER_HAND = new Set(['dbBench', 'inclineDbBench', 'dbFly', 'dbOhp', 'lateral', 'frontRaise', 'dbShrug', 'dbRow', 'dbCurl', 'hammer', 'lungeDb', 'bulgarianDb'])
// dumbbell moves that hold ONE bell (in both hands, or on the hips): rated by that one weight
const ONE_BELL = new Set(['goblet', 'dbTriExt', 'cableCrunch', 'hipThrust'])
const perBell = (eq, base, name) => DB.test(eq) && !ONE_BELL.has(base) && !/pullover/.test(name)

/* ---------- which table an exercise uses ---------- */
const BB = /^(barbell|olympic barbell|ez barbell|trap bar)$/, SM = /^smith machine$/, DB = /^(dumbbell|kettlebell)$/
const CB = /^cable$/, LV = /^leverage machine$/, SL_ = /^sled machine$/, MC = /^(leverage machine|sled machine)$/
const BWQ = /^(body weight|weighted)$/, ANY = /./
const ONE = /\b(one|single)[ -](leg|arm)|\balternat|\bunilateral\b/
// Loads that say nothing about strength, and kit with no weight to log: not rated.
const UNRATED_EQ = /^(band|resistance band|suspension trainer|stability ball|bosu ball|roller|massage ball|wheel roller|rope|assisted|stationary bike|elliptical machine|upper body ergometer|skierg machine|stepmill machine|tire|hammer|macebell)$/
const UNRATED_NAME = /stretch|mobility|foam|massage|power sled|sled (push|drag|pull)|farmer|carry|(crab|duck|bear|monster|row) walk|walk calves|throw|toss|slam|jump|\bhop\b|\bbound\b|torque tank|isometric|hold\b|plank|dead hang|crawl/

// [name, equipment, family, ratio]: the first that fits wins, so the specific comes first.
const RULES = [
  // machines named after another lift
  [/calf/, /^sled machine$|leverage machine/, 'calfMachine', 1],
  [/good morning|deadlift/, MC, 'rdl', 0.8],
  [/lunge|split squat/, MC, 'hackMachine', 0.45],
  // legs
  [/seated.*calf|calf.*seated/, ANY, 'calfSeated', 1],
  [/calf/, DB, 'calfMachine', 0.3], [/calf/, BB, 'calfMachine', 0.75], [/calf/, SM, 'calfMachine', 0.8], [/calf/, ANY, 'calfMachine', 0.85],
  [/hack squat/, MC, 'hackMachine', 1], [/hack squat/, BB, 'hackBarbell', 1], [/hack squat/, DB, 'goblet', 0.55],
  [/lying squat|reverse.*squat|squat.*(sled|machine)/, MC, 'hackMachine', 0.95],
  [/leg press/, SL_, 'legPressSled', 1], [/(angled|45|incline).*leg press/, LV, 'legPressSled', 1],
  [/vertical leg press/, ANY, 'legPressSled', 0.8], [/leg press/, LV, 'legPressHoriz', 1], [/leg press/, ANY, 'legPressHoriz', 0.9],
  [/squat/, SM, 'smithSquat', 1], [/front squat/, BB, 'frontSquat', 1], [/front squat/, ANY, 'goblet', 0.55],
  [/bulgarian|split squat/, DB, 'bulgarianDb', 1], [/bulgarian|split squat/, BB, 'bulgarianDb', 1.9], [/bulgarian|split squat|lunge|step.?up/, SM, 'bulgarianDb', 1.9],
  [/lunge|step.?up/, DB, 'lungeDb', 1], [/lunge|step.?up/, BB, 'lungeDb', 1.9],
  [/goblet/, ANY, 'goblet', 1],
  [/overhead squat/, BB, 'squat', 0.6], [/zercher/, BB, 'squat', 0.85], [/(half|quarter) squat/, BB, 'squat', 1.15],
  [/squat/, BB, 'squat', 1], [/squat/, DB, 'goblet', 0.55],
  [/leg extension/, ANY, 'legExt', 1],
  [/(lying|prone).*leg curl|leg curl.*(lying|prone)/, ANY, 'legCurlLying', 1], [/seated.*leg curl/, ANY, 'legCurlSeated', 1],
  [/standing.*leg curl|leg curl/, CB, 'legCurlLying', 0.45], [/leg curl/, ANY, 'legCurlSeated', 1],
  [/hip thrust/, DB, 'hipThrust', 0.35], [/hip thrust/, ANY, 'hipThrust', 1], [/glute bridge/, DB, 'hipThrust', 0.3], [/glute bridge/, ANY, 'hipThrust', 0.8],
  [/adduct/, CB, 'adduction', 0.3], [/adduct/, ANY, 'adduction', 1], [/abduct/, CB, 'abduction', 0.3], [/abduct/, ANY, 'abduction', 1],
  // hinges
  [/sumo deadlift/, ANY, 'sumo', 1],
  [/romanian|stiff.?leg|\brdl\b/, DB, 'rdl', 0.4], [/romanian|stiff.?leg|\brdl\b/, ANY, 'rdl', 1],
  [/rack pull/, ANY, 'deadlift', 1.15], [/deficit deadlift/, ANY, 'deadlift', 0.9],
  [/deadlift/, DB, 'rdl', 0.45], [/deadlift/, BB, 'deadlift', 1], [/deadlift/, SM, 'deadlift', 0.9], [/deadlift/, ANY, 'rdl', 0.6],
  [/good morning/, ANY, 'goodMorning', 1],
  [/swing/, DB, 'goblet', 0.8],
  [/power clean|hang clean/, ANY, 'powerClean', 1], [/clean and jerk/, BB, 'powerClean', 0.95], [/snatch/, BB, 'powerClean', 0.8], [/clean pull|snatch pull/, BB, 'powerClean', 1.2],
  [/clean/, DB, 'powerClean', 0.3], [/clean/, ANY, 'powerClean', 1],
  [/hyperextension|back extension/, ANY, 'backExt', 1],
  // chest
  [/close.?grip.*(bench|press)/, BB, 'closeGrip', 1],
  [/bench press|floor press|pin press|board press/, SM, 'smithBench', 1],
  [/incline.*(bench|press)/, SM, 'smithBench', 0.88], [/decline.*(bench|press)/, SM, 'smithBench', 1.08],
  [/decline.*(bench|press)/, BB, 'declineBench', 1], [/incline.*(bench|press)/, BB, 'inclineBench', 1],
  [/floor press/, BB, 'bench', 0.9], [/bench press|pin press|board press/, BB, 'bench', 1],
  [/incline.*(bench|press)/, DB, 'inclineDbBench', 1], [/decline.*(bench|press)/, DB, 'dbBench', 1.05],
  [/floor press/, DB, 'dbBench', 0.9], [/bench press/, DB, 'dbBench', 1],
  [/chest press|bench press/, MC, 'chestPress', 1], [/chest press/, CB, 'chestPress', 0.8], [/chest press/, DB, 'dbBench', 1],
  [/rear delt|reverse fl/, LV, 'machineFly', 0.55], [/rear delt|reverse fl/, CB, 'lateral', 0.9], [/rear delt|reverse fl/, ANY, 'lateral', 0.9],
  [/\bfly\b|flye|pec deck|butterfly/, LV, 'machineFly', 1], [/\bfly\b|flye|crossover/, CB, 'cableFly', 1], [/\bfly\b|flye/, DB, 'dbFly', 1],
  [/pullover/, DB, 'dbRow', 0.6], [/pullover/, ANY, 'pulldown', 0.5],
  [/push.?up/, BWQ, 'pushup', 1],
  [/\bdips?\b/, BWQ, 'dip', 1], [/\bdips?\b/, MC, 'chestPress', 1],
  // shoulders
  [/push press/, ANY, 'ohp', 1.2],
  [/arnold/, DB, 'dbOhp', 0.85],
  [/shoulder press|overhead press|military|press behind|behind.*neck press/, BB, 'ohp', 1], [/shoulder press|overhead press|military/, SM, 'ohp', 1],
  [/shoulder press|overhead press|military/, DB, 'dbOhp', 1], [/shoulder press|overhead press|military/, MC, 'machineOhp', 1],
  [/shoulder press|overhead press|military/, CB, 'machineOhp', 0.8],
  [/lateral raise|side raise/, LV, 'lateral', 2.2], [/lateral raise|side raise/, ANY, 'lateral', 1],
  [/front raise/, BB, 'frontRaise', 1.8], [/front raise/, ANY, 'frontRaise', 1],
  [/face pull/, ANY, 'facePull', 1],
  [/upright row/, DB, 'dbOhp', 0.75], [/upright row/, ANY, 'ohp', 0.9],
  [/shrug/, DB, 'dbShrug', 1], [/shrug/, CB, 'bbShrug', 0.7], [/shrug/, ANY, 'bbShrug', 1],
  // back
  [/chin.?up/, BWQ, 'chinup', 1], [/pull.?up/, BWQ, 'pullup', 1], [/inverted row|australian/, BWQ, 'pullup', 1.6],
  [/straight.?arm.*pull.?down|pull.?down.*straight.?arm/, ANY, 'pulldown', 0.5],
  [/pulldown|pull.?down/, CB, 'pulldown', 1], [/pulldown|pull.?down/, MC, 'pulldown', 1],
  [/t.?bar row/, ANY, 'tbar', 1],
  [/row/, CB, 'cableRow', 1], [/row/, MC, 'machineRow', 1],
  [/row/, DB, 'dbRow', 1], [/pendlay/, BB, 'row', 0.95], [/row/, BB, 'row', 1], [/row/, SM, 'row', 1],
  // arms
  [/wrist curl|wrist flexion/, DB, 'wristCurl', 0.45], [/reverse wrist|wrist extension/, ANY, 'wristCurl', 0.6], [/wrist curl/, ANY, 'wristCurl', 1],
  [/preacher/, DB, 'dbCurl', 0.9], [/preacher/, CB, 'cableCurl', 0.9], [/preacher/, ANY, 'preacher', 1],
  [/hammer curl/, DB, 'hammer', 1], [/hammer curl/, CB, 'cableCurl', 0.95],
  [/reverse curl|reverse grip curl/, DB, 'dbCurl', 0.75], [/reverse curl|reverse grip curl/, ANY, 'curl', 0.75],
  [/concentration curl/, ANY, 'dbCurl', 0.95], [/(incline|spider).*curl/, DB, 'dbCurl', 0.85],
  [/curl/, /^ez barbell$/, 'ezCurl', 1], [/curl/, BB, 'curl', 1], [/curl/, DB, 'dbCurl', 1], [/curl/, CB, 'cableCurl', 1], [/curl/, MC, 'preacher', 1],
  [/rope.*(pushdown|push.?down)|(pushdown|push.?down).*rope/, CB, 'ropePushdown', 1], [/pushdown|push.?down/, ANY, 'pushdown', 1],
  [/skull|lying.*triceps? extension|french press/, DB, 'skull', 0.3], [/skull|lying.*triceps? extension|french press/, ANY, 'skull', 1],
  [/kickback/, DB, 'dbTriExt', 0.5], [/kickback/, CB, 'pushdown', 0.25],
  [/triceps? (extension|press)|overhead extension/, DB, 'dbTriExt', 1], [/triceps? (extension|press)|overhead extension/, CB, 'ropePushdown', 0.8],
  [/triceps? (extension|press)/, ANY, 'pushdown', 1],
  // core
  [/crunch|sit.?up/, CB, 'cableCrunch', 1], [/crunch|sit.?up/, MC, 'cableCrunch', 1], [/crunch|sit.?up/, /^(dumbbell|kettlebell|weighted|weight plate|medicine ball)$/, 'cableCrunch', 0.35],
  [/wood ?chop|pallof|twist/, CB, 'cableCrunch', 0.5],
  [/leg raise|knee raise|toes to bar/, BWQ, 'legraise', 1], [/crunch|sit.?up|v.?up|jackknife/, BWQ, 'legraise', 2.5],
  [/squat|lunge|step.?up|pistol/, BWQ, 'bwlegs', 1],
]
// Nothing in the name: the main muscle and the kind of equipment decide, as an estimate.
// [whole-load family, ratio, one-dumbbell family, ratio]
const BY_MUSCLE = {
  chest: ['chestPress', 0.8, 'dbFly', 1.2], 'front-delts': ['machineOhp', 0.8, 'dbOhp', 0.8], 'side-delts': ['lateral', 2, 'lateral', 1],
  'rear-delts': ['lateral', 1.8, 'lateral', 0.9], lats: ['pulldown', 0.9, 'dbRow', 0.9], 'upper-back': ['cableRow', 0.9, 'dbRow', 0.9],
  trapezius: ['bbShrug', 0.8, 'dbShrug', 0.8], biceps: ['cableCurl', 0.9, 'dbCurl', 0.9], triceps: ['pushdown', 0.9, 'dbTriExt', 0.9],
  forearm: ['wristCurl', 0.8, 'wristCurl', 0.4], quadriceps: ['legExt', 1, 'lungeDb', 1], hamstring: ['legCurlSeated', 1, 'rdl', 0.4],
  gluteal: ['hipThrust', 0.6, 'lungeDb', 1], calves: ['calfMachine', 0.8, 'calfMachine', 0.3], adductors: ['adduction', 0.8, 'adduction', 0.3],
  abs: ['cableCrunch', 0.7, 'cableCrunch', 0.35], obliques: ['cableCrunch', 0.6, 'cableCrunch', 0.3], 'lower-back': ['rdl', 0.5, 'rdl', 0.3],
}
const BY_MUSCLE_BW = { abs: 'legraise', obliques: 'legraise', quadriceps: 'bwlegs', gluteal: 'bwlegs', hamstring: 'bwlegs', calves: 'bwlegs',
  chest: 'pushup', triceps: 'dip', lats: 'pullup', biceps: 'chinup', 'upper-back': 'pullup', 'lower-back': 'backExt' }

const CACHE = new Map()
/** { base, k, hand, conf } for an exercise, or null when it is not rated. */
export function familyOf(exOrId) {
  const ex = exerciseOf(exOrId)
  if (!ex) return null
  if (CACHE.has(ex)) return CACHE.get(ex)
  const name = (ex.n || '').toLowerCase(), eq = (ex.eq || '').toLowerCase()
  const mus = Object.entries(musclesOf(ex) || {}).sort((a, b) => b[1] - a[1]).map(([m]) => m)
  let r = null
  if (ex.bp !== 'cardio' && mus.length && !UNRATED_EQ.test(eq) && !UNRATED_NAME.test(name)) {
    const one = ONE.test(name), rule = RULES.find(([re, eqRe]) => re.test(name) && eqRe.test(eq))
    if (rule) {
      const [, , base, k0] = rule, fam = FAMILIES[base]
      // one leg or one arm of a two-sided table: half of it (a dumbbell table is already one arm)
      const k = k0 * (one && !fam.reps && !PER_HAND.has(base) && !DB.test(eq) ? 0.5 : 1)
      r = { base, k, hand: perBell(eq, base, name), conf: k === 1 ? 'direct' : 'variant' }
    } else if (BWQ.test(eq)) {
      const base = BY_MUSCLE_BW[mus[0]]
      if (base) r = { base, k: 1, hand: false, conf: 'estimate' }
    } else if (BY_MUSCLE[mus[0]]) {
      const [whole, kw, bell, kb] = BY_MUSCLE[mus[0]], isBell = DB.test(eq)
      const base = isBell ? bell : whole
      r = { base, k: (isBell ? kb : kw) * (one && !isBell ? 0.5 : 1), hand: perBell(eq, base, name), conf: 'estimate' }
    }
  }
  CACHE.set(ex, r)
  return r
}
