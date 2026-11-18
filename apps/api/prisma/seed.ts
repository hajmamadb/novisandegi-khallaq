import { PrismaClient, ApprovalStatus } from '@prisma/client';
import { characters as seedCharacters } from './seedData/characters';
import { openingLines as seedOpeningLines } from './seedData/openingLines';
import { objectItems as seedObjectItems } from './seedData/objectItems';
import { words as seedWords } from './seedData/words';
import { structurePhrases as seedStructurePhrases } from './seedData/structurePhrases';
import { referenceStories as seedReferenceStories } from './seedData/referenceStories';
import { newsItems as seedNewsItems } from './seedData/newsItems';
import { emotionLexicon as seedEmotionLexicon } from './seedData/emotionLexicon';
import { imageAssets as seedImageAssets } from './seedData/imageAssets';
import { styleParagraphs as seedStyleParagraphs } from './seedData/styleParagraphs';
import { structureTemplates as seedStructureTemplates } from './seedData/structureTemplates';
import { places as seedPlaces } from './seedData/places';
import { whatIfQuestions as seedWhatIfQuestions } from './seedData/whatIfQuestions';
import { cutupTexts as seedCutupTexts } from './seedData/cutupTexts';
const prisma = new PrismaClient();

// ---------- I.1 ExerciseTypes (11, phase 1) ----------
const exercises = [
  { slug: 'freewriting', title: 'نوشتن آزاد', category: 'BASIC', accessLevel: 'NOVICE',
    description: 'بدون توقف بنویس. هرچه در ذهن داری بریز روی صفحه.',
    durationSeconds: 900, wordTargetMin: 200, wordTargetMax: 500,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { fluidity: 0.6, voice: 0.4 } },
  { slug: 'five-senses', title: 'حواس پنجگانه', category: 'BASIC', accessLevel: 'NOVICE',
    description: 'یک مکان را با یک حس توصیف کن. بدون نام بردن حس مستقیم.',
    durationSeconds: 600, wordTargetMin: 150, wordTargetMax: 300,
    bankSourceType: 'PLACE', baseXp: 40, difficultyBase: 1.1,
    skillWeightsJson: { description: 0.7, imagery: 0.3 } },
  { slug: 'opening-line', title: 'جمله اول', category: 'BASIC', accessLevel: 'NOVICE',
    description: 'با جمله داده‌شده شروع کن و ادامه بده.',
    durationSeconds: 600, wordTargetMin: 150, wordTargetMax: 400,
    bankSourceType: 'OPENING_LINE', baseXp: 20, difficultyBase: 1.0,
    skillWeightsJson: { opening: 0.5, flow: 0.5 } },
  { slug: 'perspectives', title: 'دیدگاه‌های مختلف', category: 'BASIC', accessLevel: 'NOVICE',
    description: 'از دید شخصیت داده‌شده بنویس.',
    durationSeconds: 720, wordTargetMin: 200, wordTargetMax: 400,
    bankSourceType: 'CHARACTER', baseXp: 40, difficultyBase: 1.2,
    skillWeightsJson: { character: 0.6, voice: 0.4 } },
  { slug: 'news-to-story', title: 'خبر به داستان', category: 'STRUCTURE', accessLevel: 'NOVICE',
    description: 'از خبر داده‌شده یک داستان بساز.',
    durationSeconds: 1200, wordTargetMin: 300, wordTargetMax: 700,
    bankSourceType: 'NEWS', baseXp: 60, difficultyBase: 1.3,
    skillWeightsJson: { plot: 0.5, character: 0.5 } },
  { slug: 'six-word-story', title: 'داستان شش‌کلمه‌ای', category: 'STRUCTURE', accessLevel: 'NOVICE',
    description: 'دقیقااً شش کلمه.',
    durationSeconds: 300, wordTargetMin: 6, wordTargetMax: 6,
    bankSourceType: null, baseXp: 20, difficultyBase: 1.5,
    skillWeightsJson: { brevity: 1.0 } },
  { slug: 'hundred-word-story', title: 'داستان ۱۰۰ کلمه‌ای', category: 'STRUCTURE', accessLevel: 'NOVICE',
    description: 'دقیقااً ۱۰۰ کلمه.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 100,
    bankSourceType: null, baseXp: 40, difficultyBase: 1.4,
    skillWeightsJson: { brevity: 0.5, plot: 0.5 } },
  { slug: 'want-and-fear', title: 'شخصیت با خواسته و ترس', category: 'STRUCTURE', accessLevel: 'NOVICE',
    description: 'شخصیتی بساز با یک خواسته و یک ترس. صحنه تصادم را بنویس.',
    durationSeconds: 1200, wordTargetMin: 250, wordTargetMax: 600,
    bankSourceType: null, baseXp: 40, difficultyBase: 1.3,
    skillWeightsJson: { character: 0.7, scene: 0.3 } },
  { slug: 'style-imitation', title: 'تقلید سبکی', category: 'STYLE', accessLevel: 'CRAFTSPERSON',
    description: 'از پاراگراف داده‌شده تقلید کن.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 500,
    bankSourceType: 'STYLE_PARAGRAPH', baseXp: 50, difficultyBase: 1.4,
    skillWeightsJson: { style: 0.8, imitation: 0.2 } },
  { slug: 'remove-adjectives', title: 'حذف صفت‌ها و قیدها', category: 'STYLE', accessLevel: 'CRAFTSPERSON',
    description: 'یک نوشته قبلی را ویرایش کن. صفت‌ها را حذف کن.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 300,
    bankSourceType: null, baseXp: 40, difficultyBase: 1.3,
    skillWeightsJson: { economy: 1.0 } },
  { slug: 'show-dont-tell', title: 'ترجمه احساس به عمل', category: 'STYLE', accessLevel: 'NOVICE',
    description: 'جمله احساس داده‌شده را بدون نام بردن احساس بازنویسی کن.',
    durationSeconds: 600, wordTargetMin: 100, wordTargetMax: 250,
    bankSourceType: 'EMOTION', baseXp: 30, difficultyBase: 1.2,
    skillWeightsJson: { description: 0.6, show: 0.4 } },
  // ---------- T. Advanced & Rewriting (PROFESSIONAL) ----------
  { slug: 'rewrite-famous-story', title: 'بازنویسی داستان مشهور', category: 'ADVANCED', accessLevel: 'PROFESSIONAL',
    description: 'یک داستان مشهور (فارسی یا ترجمه‌شده) را با مقصد تازه (زمان یا مکان) بازنویسی کن.',
    durationSeconds: 1800, wordTargetMin: 400, wordTargetMax: 1200,
    bankSourceType: 'REFERENCE_STORY', baseXp: 100, difficultyBase: 2.0,
    skillWeightsJson: { plot: 0.4, voice: 0.3, adaptation: 0.3 } },
  { slug: 'start-from-end', title: 'شروع از پایان', category: 'ADVANCED', accessLevel: 'PROFESSIONAL',
    description: 'صحنه‌ی آخر داستان را بنویس، سپس صحنه‌های قبلی را به‌صورت زنجیره به عقب بساز.',
    durationSeconds: 2400, wordTargetMin: 300, wordTargetMax: 1000,
    bankSourceType: null, baseXp: 120, difficultyBase: 2.2,
    skillWeightsJson: { structure: 0.5, plot: 0.3, character: 0.2 } },
  { slug: 'dialogue-only', title: 'گفت‌وگوی بدون توصیف', category: 'ADVANCED', accessLevel: 'PROFESSIONAL',
    description: 'فقط دیالوگ بنویس (الگو: نام: متن). مکان و کنش باید از خودِ گفت‌وگو برآید.',
    durationSeconds: 1200, wordTargetMin: 150, wordTargetMax: 500,
    bankSourceType: 'CHARACTER', baseXp: 80, difficultyBase: 1.8,
    skillWeightsJson: { dialogue: 0.7, subtext: 0.3 } },
  { slug: 'remove-a-scene', title: 'حذف یک صحنه', category: 'ADVANCED', accessLevel: 'PROFESSIONAL',
    description: 'یک صحنه از متن را حذف کن، نسخه‌ی بدون آن را مرور کن و بنویس «آیا کار می‌کند؟».',
    durationSeconds: 1500, wordTargetMin: 100, wordTargetMax: 600,
    bankSourceType: 'REFERENCE_STORY', baseXp: 90, difficultyBase: 1.9,
    skillWeightsJson: { structure: 0.6, editing: 0.4 } },
  // ---------- Th. Ideas & Daily Writing ----------
  { slug: 'morning-pages', title: 'صفحات صبحگاهی', category: 'HABIT', accessLevel: 'NOVICE',
    description: 'هر روز بنویس: ۱۰ نوبت اول ۱ صفحه، نوبت‌های بعدی تا سقف ۵ صفحه (هر صفحه = ۲۵۰ واژه پیش‌فرض).',
    durationSeconds: 1200, wordTargetMin: 250, wordTargetMax: 1250,
    bankSourceType: null, baseXp: 40, difficultyBase: 1.0,
    skillWeightsJson: { habit: 0.6, fluidity: 0.4 } },
  { slug: 'clustering', title: 'خوشه‌ای', category: 'IDEA', accessLevel: 'CREATIVE',
    description: 'کلمه‌ی تصادفی بکش، شبکه‌ای از کلمات نزدیک بساز و به پیش‌نویس متن تبدیل کن.',
    durationSeconds: 900, wordTargetMin: 50, wordTargetMax: 400,
    bankSourceType: 'WORD', baseXp: 50, difficultyBase: 1.3,
    rubricJson: { check: 'clustering', minHubWords: 8 },
    skillWeightsJson: { ideation: 0.5, imagery: 0.3, flow: 0.2 } },
  { slug: 'write-with-object', title: 'نوشتن با شیء', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'با شیء داده‌شده بنویس: روایتی که آن شیء در آن نقش دارد.',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 500,
    bankSourceType: 'OBJECT', baseXp: 40, difficultyBase: 1.2,
    skillWeightsJson: { imagery: 0.5, description: 0.3, character: 0.2 } },
  { slug: 'letter-from-character', title: 'نامه‌نگاری با شخصیت', category: 'SCENE', accessLevel: 'CRAFTSPERSON',
    description: 'از دید شخصیت داده‌شده نامه‌ای بنویس (یا پاسخ او را بنویس).',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 600,
    bankSourceType: 'CHARACTER', baseXp: 60, difficultyBase: 1.5,
    skillWeightsJson: { voice: 0.5, character: 0.3, dialogue: 0.2 } },
  { slug: 'interview-with-character', title: 'مصاحبه با شخصیت', category: 'SCENE', accessLevel: 'CREATIVE',
    description: 'با شخصیت داده‌شده مصاحبه کن: پرسش‌ها را بپرس، پاسخ‌ها را خودش بنویس.',
    durationSeconds: 1500, wordTargetMin: 200, wordTargetMax: 700,
    bankSourceType: 'CHARACTER', baseXp: 70, difficultyBase: 1.6,
    skillWeightsJson: { dialogue: 0.5, character: 0.3, voice: 0.2 } },
  { slug: 'cutup', title: 'برش (Cut-up)', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'متن داده‌شده را بکش، برش بده و جمله‌ها را به ترتیب تازه بچین تا متن تازه‌ای بسازی.',
    durationSeconds: 1200, wordTargetMin: 50, wordTargetMax: 300,
    bankSourceType: 'CUTUP_TEXT', baseXp: 50, difficultyBase: 1.4,
    skillWeightsJson: { creativity: 0.6, flow: 0.4 } },
  // ---------- Ch. Habits & Work Methods (ح) ----------
  { slug: 'read-like-writer', title: 'خواندن مانند نویسنده', category: 'HABIT', accessLevel: 'NOVICE',
    description: 'یک فصل از کتاب موردنظرت را بخوان. ثبت کن: چه تصمیمی گرفت و چرا؟ نتیجه‌ی ثبت‌شده + معرفی نویسنده.',
    durationSeconds: 1200, wordTargetMin: 100, wordTargetMax: 500,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { analysis: 0.5, craft: 0.3, observation: 0.2 } },
  { slug: 'zero-draft', title: 'پیش‌نویس صفر', category: 'HABIT', accessLevel: 'NOVICE',
    description: 'بدون ویرایش بنویس. فیلد اجباری: «چرا این متن را نوشتم؟» — هدف: عبور از خودسنجی.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 600,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { flow: 0.6, courage: 0.4 } },
  { slug: 'sprint-pomodoro', title: 'اسپرینت (پومودورو)', category: 'HABIT', accessLevel: 'NOVICE',
    description: '۲۵ دقیقه نوشتن، ۵ دقیقه استراحت. تعداد دوره‌ها و کلمه‌ی هر دوره ثبت می‌شود.',
    durationSeconds: 1500, wordTargetMin: 100, wordTargetMax: 800,
    bankSourceType: null, baseXp: 40, difficultyBase: 1.0,
    skillWeightsJson: { focus: 0.5, habit: 0.3, productivity: 0.2 } },
  { slug: 'word-target-staircase', title: 'هدف کلمه‌ای', category: 'HABIT', accessLevel: 'NOVICE',
    description: 'پلکان کلمه: ۵۰ ← ۱۰۰ ← ۱۵۰ ← ۲۰۰ ← ۳۰۰ ← ۵۰۰ ← ۷۵۰ ← ۱۰۰۰. بعد از ۳ روز موفق (±۱۰٪) پله‌ی بعد باز می‌شود.',
    durationSeconds: 900, wordTargetMin: 50, wordTargetMax: 1000,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { consistency: 0.6, growth: 0.4 } },
  // ---------- Kh. Story Starters (خ) ----------
  { slug: 'discovery-draft', title: 'پیش‌نویس کشفی', category: 'BASIC', accessLevel: 'NOVICE',
    description: 'بدون طرح بنویس و ببین کجا می‌رود. فقط کاوش — بدون ویرایش، بدون قضاوت.',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 600,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { discovery: 0.5, flow: 0.3, curiosity: 0.2 } },
  { slug: 'bad-draft', title: 'پیش‌نویس بد', category: 'BASIC', accessLevel: 'NOVICE',
    description: 'عمداً بد بنویس. هرچه بدتر، بهتر. هدف: شکستن ترس از صفحه‌ی سفید.',
    durationSeconds: 600, wordTargetMin: 50, wordTargetMax: 300,
    bankSourceType: null, baseXp: 20, difficultyBase: 0.8,
    skillWeightsJson: { courage: 0.5, play: 0.5 } },
  { slug: 'start-from-image', title: 'شروع از تصویر', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'از تصویر داده‌شده یک صحنه یا داستان بنویس. چه کسی این تصویر را دیده؟ چه اتفاقی افتاده؟',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 500,
    bankSourceType: 'IMAGE', baseXp: 40, difficultyBase: 1.2,
    skillWeightsJson: { imagery: 0.5, scene: 0.3, character: 0.2 } },
  { slug: 'start-from-question', title: 'شروع از پرسش', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'یک پرسش «اگر…؟» از بانک انتخاب کن و داستان را از همان پرسش شروع کن.',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 500,
    bankSourceType: 'WHAT_IF', baseXp: 40, difficultyBase: 1.2,
    skillWeightsJson: { ideation: 0.5, plot: 0.3, voice: 0.2 } },
  // ---------- D. Scene-by-Scene (ذ) ----------
  { slug: 'and-then', title: '«و بعد؟»', category: 'SCENE', accessLevel: 'CRAFTSPERSON',
    description: 'با صحنه‌ی داده‌شده (خودت یا از بانک) شروع کن. صحنه‌ی بعد را بنویس: «و بعد چه شد؟»',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'REFERENCE_STORY', baseXp: 50, difficultyBase: 1.3,
    skillWeightsJson: { plot: 0.5, pacing: 0.3, tension: 0.2 } },
  { slug: 'but-therefore', title: 'اما/بنابراین', category: 'SCENE', accessLevel: 'CRAFTSPERSON',
    description: 'هر صحنه‌ی بعدی را با «اما» یا «بنابراین» به صحنه‌ی قبلی وصل کن. زنجیره‌ی صحنه‌ها را ببین.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 600,
    bankSourceType: 'REFERENCE_STORY', baseXp: 60, difficultyBase: 1.5,
    skillWeightsJson: { structure: 0.5, plot: 0.3, logic: 0.2 } },
  { slug: 'conflict-ladder', title: 'نردبان تعارض', category: 'SCENE', accessLevel: 'PROFESSIONAL',
    description: 'هر صحنه را با امتیاز شدت (۱ تا ۱۰) مشخص کن. نمودار افزایش خطر را ببین.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 800,
    bankSourceType: 'REFERENCE_STORY', baseXp: 70, difficultyBase: 1.8,
    skillWeightsJson: { tension: 0.5, structure: 0.3, pacing: 0.2 } },
  { slug: 'unwanted-ending', title: 'پایان ناخواسته', category: 'SCENE', accessLevel: 'CRAFTSPERSON',
    description: 'پایانی بنویس که شخصیت نمی‌خواهد. چرا به آن رسید؟ چه انتخابی او را به آن‌جا رساند؟',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 500,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.4,
    skillWeightsJson: { character: 0.4, plot: 0.4, irony: 0.2 } },
  // ---------- Z. Character Work (ذ) ----------
  { slug: 'character-dialogue', title: 'گفت‌وگو با شخصیت', category: 'SCENE', accessLevel: 'CRAFTSPERSON',
    description: 'شخصیت و موقعیت را از بانک انتخاب کن. فقط دیالوگ بنویس — بدون توصیف.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CHARACTER', baseXp: 50, difficultyBase: 1.4,
    skillWeightsJson: { dialogue: 0.6, subtext: 0.4 } },
  { slug: 'character-notebook', title: 'دفترچه‌ی شخصیت', category: 'SCENE', accessLevel: 'CREATIVE',
    description: 'به‌نام شخصیت بنویس: افکار، ترس‌ها، خواسته‌ها. تأیید ویراستار = ورود به بانک عمومی.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 700,
    bankSourceType: 'CHARACTER', baseXp: 60, difficultyBase: 1.5,
    skillWeightsJson: { voice: 0.5, character: 0.3, empathy: 0.2 } },
  // ---------- R. Mental Stimulation (ر) ----------
  { slug: 'cadaver-exercise', title: 'جسد نفیس', category: 'CONSTRAINT', accessLevel: 'CRAFTSPERSON',
    description: 'اتاق چندنفره: نوبتی هر نفر یک جمله می‌نویسد و فقط جمله‌ی قبلی را می‌بیند. در پایان متن کامل باز می‌شود.',
    durationSeconds: 1800, wordTargetMin: 50, wordTargetMax: 300,
    bankSourceType: null, baseXp: 60, difficultyBase: 1.5,
    skillWeightsJson: { collaboration: 0.4, surprise: 0.3, flow: 0.3 } },
  { slug: 'music-writer', title: 'موسیقی و فضای حسی', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'با صدای محیطی (باران، کافه، …) بنویس. تایمر نوشتن فعال است.',
    durationSeconds: 1200, wordTargetMin: 100, wordTargetMax: 500,
    bankSourceType: 'AMBIENT_AUDIO', baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { atmosphere: 0.5, immersion: 0.3, flow: 0.2 } },
  { slug: 'walking-writing', title: 'قدم‌زدن و نوشتن', category: 'HABIT', accessLevel: 'NOVICE',
    description: 'حالت موبایل: یادداشت صوتی/متنی سریع بیرون از خانه. بعداً تبدیل به متن کن.',
    durationSeconds: 300, wordTargetMin: 20, wordTargetMax: 200,
    bankSourceType: null, baseXp: 20, difficultyBase: 0.8,
    skillWeightsJson: { observation: 0.5, immediacy: 0.3, habit: 0.2 } },
  { slug: 'random-generator', title: 'مولد تصادفی', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'کلمه، عکس یا جمله‌ای تصادفی از بانک دریافت کن و با آن بنویس.',
    durationSeconds: 600, wordTargetMin: 50, wordTargetMax: 300,
    bankSourceType: 'WORD', baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { ideation: 0.5, adaptability: 0.3, flow: 0.2 } },
  { slug: 'dream-journal', title: 'رؤیا', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'رؤیایت را بنویس. برچسب بزن (حس، شخصیت، مکان). گزینه: انتقال به پروژه.',
    durationSeconds: 600, wordTargetMin: 50, wordTargetMax: 400,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.0,
    skillWeightsJson: { imagery: 0.5, symbolism: 0.3, voice: 0.2 } },
  // ---------- Z. Post-Writing Review (ز) ----------
  { slug: 'what-i-know-now', title: 'آنچه الان می‌دانم', category: 'ADVANCED', accessLevel: 'PROFESSIONAL',
    description: 'یادداشت‌هایی درباره‌ی آنچه در این بخش آموختی بنویس. هنگام بازنویسی کنار متن نمایش داده می‌شود.',
    durationSeconds: 600, wordTargetMin: 50, wordTargetMax: 300,
    bankSourceType: null, baseXp: 40, difficultyBase: 1.5,
    skillWeightsJson: { metacognition: 0.5, craft: 0.3, growth: 0.2 } },
  { slug: 'rewrite-branch', title: 'نوشتن از نو', category: 'ADVANCED', accessLevel: 'PROFESSIONAL',
    description: 'از بخش اول شاخه‌ی تازه بساز و نسخه‌ی دوم را بنویس. دو نسخه را مقایسه کن.',
    durationSeconds: 1800, wordTargetMin: 200, wordTargetMax: 1000,
    bankSourceType: null, baseXp: 80, difficultyBase: 2.0,
    skillWeightsJson: { revision: 0.5, comparison: 0.3, craft: 0.2 } },
  // ---------- G. Creative Constraints (ج) ----------
  { slug: 'lipogram', title: 'لیپوگرام', category: 'CONSTRAINT', accessLevel: 'CRAFTSPERSON',
    description: 'هر بار یک حرف یا واژه‌ی کوتاه ممنوع می‌شود. بدون آن حرف/واژه بنویس. واژه‌های خطادار قرمز می‌شوند.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'lipogram', forbiddenLetter: 'و', level: 'letter', note: 'حرف پیش‌فرض؛ هر جلسه حرف تازه‌ای می‌تواند از promptSnapshot بخواند' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  { slug: 'n-plus-7', title: 'N+7', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'متن را بکش یا خودت بنویس. هر اسم با اسم هفتم بعدی در فرهنگ لغت جایگزین می‌شود (فاز ۱: پیش‌نمایش).',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'identity', n: 7 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  { slug: 'ekphrasis', title: 'اکفراسیس', category: 'IDEA', accessLevel: 'NOVICE',
    description: 'از تصویر داده‌شده (هنری/مستند) متن یا صحنه‌ای بنویس. مجوز و صاحب اثر ثبت شده است.',
    durationSeconds: 1200, wordTargetMin: 150, wordTargetMax: 600,
    bankSourceType: 'IMAGE', baseXp: 40, difficultyBase: 1.2,
    skillWeightsJson: { description: 0.5, imagery: 0.3, scene: 0.2 } },
  // ---------- Ch. Story Structures (چ, سطح کاربلد و بالاتر) ----------
  { slug: 'story-pillar', title: 'ستون داستان', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'قالب «روزی… به همین خاطر… تا اینکه… و در نهایت…». پیوندواژه‌ها را انتخاب کن (دستی یا تصادفی).',
    durationSeconds: 1800, wordTargetMin: 200, wordTargetMax: 800,
    bankSourceType: 'STRUCTURE_PHRASE', baseXp: 60, difficultyBase: 1.4,
    skillWeightsJson: { structure: 0.5, plot: 0.3, flow: 0.2 } },
  { slug: 'save-the-cat', title: 'Save the Cat', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'الگوی ۱۵ نقطه (Beat). هر بخش را با کارت، تعداد کلمه و یادداشت پر کن.',
    durationSeconds: 3600, wordTargetMin: 500, wordTargetMax: 3000,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 100, difficultyBase: 1.8,
    skillWeightsJson: { structure: 0.6, plot: 0.4 } },
  { slug: 'heros-journey', title: 'سفر قهرمان', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: '۱۲ مرحله‌ی کمبل/ووگلر با مثال‌های ادبی. هر مرحله را پر کن.',
    durationSeconds: 3600, wordTargetMin: 500, wordTargetMax: 3000,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 100, difficultyBase: 1.8,
    skillWeightsJson: { structure: 0.6, character: 0.4 } },
  { slug: 'three-act', title: 'سه‌پرده‌ای', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'نقطه‌ی عطف اول، نقطه‌ی میانی، نقطه‌ی عطف دوم و اوج را مشخص کن.',
    durationSeconds: 2400, wordTargetMin: 300, wordTargetMax: 1500,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 80, difficultyBase: 1.5,
    skillWeightsJson: { structure: 0.6, plot: 0.4 } },
  { slug: 'kishotenketsu', title: 'کیشوتنکتسو', category: 'STRUCTURE', accessLevel: 'PROFESSIONAL',
    description: 'چهار مرحله‌ی کی (پیشنهاد)، شو (توسعه)، تن (پیچش)، کتسو (نتیجه). بدون تعارض — فقط پیچش.',
    durationSeconds: 2400, wordTargetMin: 300, wordTargetMax: 1200,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 90, difficultyBase: 1.9,
    skillWeightsJson: { structure: 0.6, subversion: 0.4 } },
  { slug: 'snowflake', title: 'Snowflake', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'ده گام از جمله‌ی یک‌خطی تا صحنه‌ها. هر گام به گام بعد منتقل می‌شود (Wizard).',
    durationSeconds: 3600, wordTargetMin: 100, wordTargetMax: 2000,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 90, difficultyBase: 1.7,
    skillWeightsJson: { structure: 0.5, planning: 0.5 } },
  { slug: 'reverse-outline', title: 'Reverse Outline', category: 'STRUCTURE', accessLevel: 'PROFESSIONAL',
    description: 'از روی متن نوشته‌شده، هر پاراگراف را به یک «کارت خلاصه» تبدیل کن. سیستم کارت‌ها را به‌صورت خط زمانی نشان می‌دهد.',
    durationSeconds: 1800, wordTargetMin: 100, wordTargetMax: 1000,
    bankSourceType: null, baseXp: 70, difficultyBase: 1.6,
    skillWeightsJson: { structure: 0.5, analysis: 0.3, editing: 0.2 } },
  // ---------- Phase 2: 28 new exercises (the core 15-day content) ----------
  // The spec's "۳۱ تمرین جدید" is realized as: 3 already-seeded umbrella
  // exercises (lipogram, n-plus-7, clustering — now given rubric-driven
  // validation) + these 28 concrete variants. Each variant carries a
  // rubricJson the ExerciseValidator reads at submit time.
  // --- A. Lipogram ladder (stepped letter/word bans) ---
  { slug: 'lipogram-letter-v', title: 'لیپوگرام: حرف و', category: 'CONSTRAINT', accessLevel: 'CRAFTSPERSON',
    description: 'یک صحنه‌ی کوتاه بدون حرف «و» بنویس. واژه‌های خطادار قرمز می‌شوند.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'lipogram', forbiddenLetter: 'و', level: 'letter' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  { slug: 'lipogram-letter-ye', title: 'لیپوگرام: حرف ی', category: 'CONSTRAINT', accessLevel: 'CRAFTSPERSON',
    description: 'یک صحنه‌ی کوتاه بدون حرف «ی» بنویس. رایج‌ترین حرف فارسی را حذف کن.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: null, baseXp: 55, difficultyBase: 1.6,
    rubricJson: { check: 'lipogram', forbiddenLetter: 'ی', level: 'letter' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  { slug: 'lipogram-letter-alef', title: 'لیپوگرام: حرف ا', category: 'CONSTRAINT', accessLevel: 'CRAFTSPERSON',
    description: 'یک صحنه‌ی کوتاه بدون حرف «ا» بنویس. آ/آ هم ممنوع است.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: null, baseXp: 55, difficultyBase: 1.6,
    rubricJson: { check: 'lipogram', forbiddenLetter: 'ا', level: 'letter' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  { slug: 'lipogram-letter-be', title: 'لیپوگرام: حرف ب', category: 'CONSTRAINT', accessLevel: 'CRAFTSPERSON',
    description: 'یک صحنه‌ی کوتاه بدون حرف «ب» بنویس.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'lipogram', forbiddenLetter: 'ب', level: 'letter' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  { slug: 'lipogram-word', title: 'لیپوگرام: واژه‌ی ممنوع', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'یک واژه‌ی رایج (مثلاً «و») را به‌طور کامل از متن حذف کن؛ حتی در ترکیب با واژه‌های دیگر.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: null, baseXp: 60, difficultyBase: 1.7,
    rubricJson: { check: 'lipogram', forbiddenWord: 'و', level: 'word' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  { slug: 'lipogram-phrase', title: 'لیپوگرام: عبارت ممنوع', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'از به‌کاربردن یک عبارت دوکلمه‌ای رایج (مثلاً «به نظر») پرهیز کن.',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 400,
    bankSourceType: null, baseXp: 65, difficultyBase: 1.8,
    rubricJson: { check: 'lipogram', forbiddenWord: 'به نظر', level: 'phrase' },
    skillWeightsJson: { constraint: 0.5, creativity: 0.3, vocabulary: 0.2 } },
  // --- B. N+7 (transformed-draft variants) ---
  { slug: 'n7-past-tense', title: 'N+7: زمان گذشته', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'متن‌ات را بکش. نسخه‌ی N+7 را در زمان گذشته بازنویسی کن.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'past-tense', n: 7 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  { slug: 'n7-future-tense', title: 'N+7: زمان آینده', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'متن‌ات را بکش. نسخه‌ی N+7 را در زمان آینده بنویس.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'future-tense', n: 7 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  { slug: 'n7-first-person', title: 'N+7: شخضمخاطب اول', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'متن‌ات را بکش. نسخه‌ی N+7 را از دید «من» بنویس.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'first-person', n: 7 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  { slug: 'n7-third-person', title: 'N+7: شخضمخاطب سوم', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'متن‌ات را بکش. نسخه‌ی N+7 را از دید «او» بنویس.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'third-person', n: 7 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  { slug: 'n7-5', title: 'N+5', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'هر اسم با اسم پنجم بعدی در فرهنگ لغت جایگزین می‌شود.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'identity', n: 5 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  { slug: 'n7-3', title: 'N+3', category: 'CONSTRAINT', accessLevel: 'CREATIVE',
    description: 'هر اسم با اسم سوم بعدی در فرهنگ لغت جایگزین می‌شود.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'CUTUP_TEXT', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'n7', transform: 'identity', n: 3 },
    skillWeightsJson: { play: 0.5, language: 0.3, surprise: 0.2 } },
  // --- C. Clustering / word webs ---
  { slug: 'clustering-emotion', title: 'خوشه‌ی احساس', category: 'IDEA', accessLevel: 'CREATIVE',
    description: 'یک احساس را در مرکز بگذار و ۱۰ کلمه‌ی مرتبط را دورش خوشه کن؛ سپس از شبکه یک پیش‌نویس بساز.',
    durationSeconds: 900, wordTargetMin: 50, wordTargetMax: 400,
    bankSourceType: 'EMOTION', baseXp: 50, difficultyBase: 1.3,
    rubricJson: { check: 'clustering', minHubWords: 8 },
    skillWeightsJson: { ideation: 0.5, imagery: 0.3, flow: 0.2 } },
  { slug: 'clustering-place', title: 'خوشه‌ی مکان', category: 'IDEA', accessLevel: 'CREATIVE',
    description: 'یک مکان را در مرکز بگذار و حواس پنج‌گانه را به آن پیوسته خوشه کن.',
    durationSeconds: 900, wordTargetMin: 50, wordTargetMax: 400,
    bankSourceType: 'PLACE', baseXp: 50, difficultyBase: 1.3,
    rubricJson: { check: 'clustering', minHubWords: 8 },
    skillWeightsJson: { ideation: 0.5, imagery: 0.3, flow: 0.2 } },
  { slug: 'clustering-object', title: 'خوشه‌ی شیء', category: 'IDEA', accessLevel: 'CREATIVE',
    description: 'یک شیء را انتخاب کن و روابط پنهانش را کشف کن؛ ۱۰ واژه‌ی مرتبط بنویس.',
    durationSeconds: 900, wordTargetMin: 50, wordTargetMax: 400,
    bankSourceType: 'OBJECT', baseXp: 50, difficultyBase: 1.3,
    rubricJson: { check: 'clustering', minHubWords: 8 },
    skillWeightsJson: { ideation: 0.5, imagery: 0.3, flow: 0.2 } },
  { slug: 'clustering-synonym', title: 'خوشه‌ی هم‌معنی', category: 'STYLE', accessLevel: 'CRAFTSPERSON',
    description: 'یک واژه را انتخاب کن و ۱۲ هم‌معنی و نزدیک‌معنی آن را خوشه کن؛ سپس متن را بدون تکرار واژه‌ی اصلی بنویس.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 400,
    bankSourceType: 'WORD', baseXp: 55, difficultyBase: 1.4,
    rubricJson: { check: 'clustering', minHubWords: 10 },
    skillWeightsJson: { vocabulary: 0.5, precision: 0.3, play: 0.2 } },
  { slug: 'clustering-antonym', title: 'خوشه‌ی متضاد', category: 'IDEA', accessLevel: 'CREATIVE',
    description: 'یک مفهوم را در مرکز بگذار و ۸ واژه‌ی متضادش را از آن بکش؛ تضاد را به پیش‌نویس بیاور.',
    durationSeconds: 900, wordTargetMin: 50, wordTargetMax: 400,
    bankSourceType: 'WORD', baseXp: 50, difficultyBase: 1.3,
    rubricJson: { check: 'clustering', minHubWords: 6 },
    skillWeightsJson: { ideation: 0.5, tension: 0.3, flow: 0.2 } },
  // --- D. Structural variants ---
  { slug: 'save-the-cat-beat', title: 'Save the Cat: یک بیت', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'فقط یک بیت از الگوی ۱۵ نقطه (مثلاً «مهمانی در دنیای عادی») را پر کن و بنویس.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 800,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'structure', beats: ['ordinary-world'], minWordsPerBeat: 80 },
    skillWeightsJson: { structure: 0.6, plot: 0.4 } },
  { slug: 'heros-journey-stage', title: 'سفر قهرمان: یک مرحله', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'فقط یک مرحله از ۱۲ مرحله‌ی کمبل (مثلاً «فراخوان به ماجرا») را پر کن.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 800,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'structure', beats: ['call-to-adventure'], minWordsPerBeat: 80 },
    skillWeightsJson: { structure: 0.6, character: 0.4 } },
  { slug: 'three-act-midpoint', title: 'سه‌پرده‌ای: نقطه‌ی میانی', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'نقطه‌ی میانی (Midpoint) سه‌پرده را بنویس؛ لحظه‌ی بزرگی که داستان را به فاز دوم می‌برد.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 800,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 60, difficultyBase: 1.6,
    rubricJson: { check: 'structure', beats: ['midpoint'], minWordsPerBeat: 80 },
    skillWeightsJson: { structure: 0.6, plot: 0.4 } },
  { slug: 'kishotenketsu-ten', title: 'کیشوتنکتسو: پیچش', category: 'STRUCTURE', accessLevel: 'PROFESSIONAL',
    description: 'فقط مرحله‌ی «تن» (پیچش) را بنویس؛ لحظه‌ای که درک خواننده تغییر می‌کند.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 800,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 70, difficultyBase: 1.8,
    rubricJson: { check: 'structure', beats: ['ten'], minWordsPerBeat: 80 },
    skillWeightsJson: { structure: 0.6, subversion: 0.4 } },
  { slug: 'snowflake-step', title: 'Snowflake: یک گام', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'فقط گام ۳ (پاراگراف‌ی یک‌خطی برای هر شخصیت اصلی) را از الگوی Snowflake پر کن.',
    durationSeconds: 900, wordTargetMin: 100, wordTargetMax: 500,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'structure', beats: ['step3-characters'], minWordsPerBeat: 40 },
    skillWeightsJson: { structure: 0.5, planning: 0.5 } },
  { slug: 'column-story', title: 'ستون داستان', category: 'STRUCTURE', accessLevel: 'CRAFTSPERSON',
    description: 'داستان را در ستون‌های زمانی موازی بنویس: هر ستون یک زمان/مکان متفاوت.',
    durationSeconds: 1800, wordTargetMin: 300, wordTargetMax: 1000,
    bankSourceType: 'STRUCTURE_TEMPLATE', baseXp: 70, difficultyBase: 1.7,
    rubricJson: { check: 'structure', beats: ['column-1', 'column-2'], minWordsPerBeat: 100 },
    skillWeightsJson: { structure: 0.6, plot: 0.3, voice: 0.1 } },
  // --- E. Style variants ---
  { slug: 'remove-adverbs', title: 'حذف قیدها', category: 'STYLE', accessLevel: 'CRAFTSPERSON',
    description: 'یک صحنه بنویس بدون هیچ قیدی (کلماتی که به «ـmente/ـانه» ختم می‌شوند یا به فعل/صفت معنا می‌دهند).',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 400,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'style', rule: 'no-adverbs', maxViolations: 2 },
    skillWeightsJson: { economy: 0.7, precision: 0.3 } },
  { slug: 'no-contractions', title: 'بدون فعل کمکی', category: 'STYLE', accessLevel: 'CRAFTSPERSON',
    description: 'صحنه‌ای بنویس بدون به‌کاربردن فعل‌های کمکی («می‌»، «دارد»، «شود»). فعل‌های کامل را استفاده کن.',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 400,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'style', rule: 'no-auxiliary', maxViolations: 3 },
    skillWeightsJson: { economy: 0.6, voice: 0.4 } },
  { slug: 'one-sentence-story', title: 'داستان یک‌جمله‌ای', category: 'STYLE', accessLevel: 'NOVICE',
    description: 'داستان‌ات را در یک جمله‌ی کامل (نه کمتر از ۲۰ واژه) بگو.',
    durationSeconds: 300, wordTargetMin: 20, wordTargetMax: 60,
    bankSourceType: null, baseXp: 30, difficultyBase: 1.3,
    rubricJson: { check: 'style', rule: 'single-sentence', maxSentences: 1 },
    skillWeightsJson: { brevity: 0.7, plot: 0.3 } },
  { slug: 'second-person-story', title: 'داستان دوم‌شخصه', category: 'STYLE', accessLevel: 'CREATIVE',
    description: 'داستان را با ضمیر «تو» بنویس؛ خواننده مستقیماً در صحنه باشد.',
    durationSeconds: 1200, wordTargetMin: 200, wordTargetMax: 700,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'style', rule: 'second-person', minSecondPersonRatio: 0.3 },
    skillWeightsJson: { voice: 0.6, immersion: 0.4 } },
  { slug: 'present-tense-scene', title: 'صحنه‌ی حال', category: 'STYLE', accessLevel: 'CRAFTSPERSON',
    description: 'یک صحنه را در زمان حال بنویس؛ لحظه‌ای، زنده، بدون گذشته.',
    durationSeconds: 900, wordTargetMin: 150, wordTargetMax: 500,
    bankSourceType: null, baseXp: 50, difficultyBase: 1.5,
    rubricJson: { check: 'style', rule: 'present-tense', minPresentRatio: 0.5 },
    skillWeightsJson: { voice: 0.5, immediacy: 0.5 } },
] as const;

// ---------- I.3 Badges (20, phase 1) ----------
const badges = [
  { slug: 'streak-3', family: 'STREAK', tier: 'BRONZE', titleFa: 'جرقه', descriptionFa: '۳ روز متوالی نوشتی', displayOrder: 1 },
  { slug: 'streak-7', family: 'STREAK', tier: 'SILVER', titleFa: 'شعله', descriptionFa: '۷ روز متوالی نوشتی', displayOrder: 2 },
  { slug: 'streak-30', family: 'STREAK', tier: 'GOLD', titleFa: 'آتش', descriptionFa: '۳۰ روز متوالی نوشتی', displayOrder: 3 },
  { slug: 'streak-100', family: 'STREAK', tier: 'DIAMOND', titleFa: 'خورشید', descriptionFa: '۱۰۰ روز متوالی نوشتی', displayOrder: 4 },
  { slug: 'first-session', family: 'MILESTONE', tier: 'BRONZE', titleFa: 'قدم اول', descriptionFa: 'اولین جلسه را کامل کردی', displayOrder: 10 },
  { slug: 'sessions-10', family: 'MILESTONE', tier: 'BRONZE', titleFa: 'مسافر', descriptionFa: '۱۰ جلسه کامل کردی', displayOrder: 11 },
  { slug: 'sessions-50', family: 'MILESTONE', tier: 'SILVER', titleFa: 'رهرو', descriptionFa: '۵۰ جلسه کامل کردی', displayOrder: 12 },
  { slug: 'sessions-200', family: 'MILESTONE', tier: 'GOLD', titleFa: 'کوهنورد', descriptionFa: '۲۰۰ جلسه کامل کردی', displayOrder: 13 },
  { slug: 'words-1000', family: 'MILESTONE', tier: 'BRONZE', titleFa: 'هزار واژه', descriptionFa: 'به ۱۰۰۰ واژه رسیدی', displayOrder: 14 },
  { slug: 'words-10000', family: 'MILESTONE', tier: 'SILVER', titleFa: 'ده‌هزار واژه', descriptionFa: 'به ۱۰۰۰۰ واژه رسیدی', displayOrder: 15 },
  { slug: 'words-100000', family: 'MILESTONE', tier: 'GOLD', titleFa: 'صد‌هزار واژه', descriptionFa: 'به ۱۰۰۰۰۰ واژه رسیدی', displayOrder: 16 },
  { slug: 'all-basic-categories', family: 'EXPLORATION', tier: 'BRONZE', titleFa: 'کاوشگر', descriptionFa: 'از هر دسته تمرین یک‌بار انجام دادی', displayOrder: 20 },
  { slug: 'eight-exercises', family: 'EXPLORATION', tier: 'SILVER', titleFa: 'هشت‌گانه', descriptionFa: '۸ نوع تمرین متفاوت انجام دادی', displayOrder: 21 },
  { slug: 'all-banks', family: 'EXPLORATION', tier: 'GOLD', titleFa: 'بانک‌گرد', descriptionFa: 'از همه بانک‌ها استفاده کردی', displayOrder: 22 },
  { slug: 'five-senses-complete', family: 'QUALITY', tier: 'SILVER', titleFa: 'پنج‌حسی', descriptionFa: 'یک مکان را با هر ۵ حس توصیف کردی', displayOrder: 30 },
  { slug: 'six-word-master', family: 'QUALITY', tier: 'SILVER', titleFa: 'شش‌گانه', descriptionFa: '۱۰ داستان شش‌کلمه‌ای نوشتی', displayOrder: 31 },
  { slug: 'hundred-word-master', family: 'QUALITY', tier: 'SILVER', titleFa: 'صدتایی', descriptionFa: '۱۰ داستان ۱۰۰ کلمه‌ای نوشتی', displayOrder: 32 },
  { slug: 'first-show-dont-tell', family: 'QUALITY', tier: 'BRONZE', titleFa: 'نشان بده', descriptionFa: "اولین تمرین Show, Don't Tell را کامل کردی", displayOrder: 33 },
  { slug: 'night-owl', family: 'HIDDEN', tier: 'SPECIAL', titleFa: 'جغد شب', descriptionFa: '...', isHidden: true, displayOrder: 90 },
  { slug: 'phoenix-return', family: 'HIDDEN', tier: 'SPECIAL', titleFa: 'ققنوس', descriptionFa: '...', isHidden: true, displayOrder: 91 },
] as const;

// ---------- I.4 BadgeRules (20 — one per badge) ----------
// DECISION: DSL context (badges.service.buildContext) exposes only
// { current_streak, best_streak, sessions_count, words_total, xp_total, level }
// plus payload.rows (empty for exercise_submitted events). So every auto rule
// below is a `threshold` on a context field that buildContext always populates
// — these fire reliably. The 4 quality/exploration badges that need per-row
// data (five-senses, six-word, hundred-word, all-banks) are declared as
// `B_MANUAL` (deferred): they are tracked but never auto-award until a future
// phase ships row-aware distinct_count/sum verification. No `custom` type is
// used (the evaluator returns false for it in phase 1).
const rules = [
  { badgeSlug: 'streak-3', triggerEvent: 'streak.updated',
    conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 3 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'streak-7', triggerEvent: 'streak.updated',
    conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 7 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'streak-30', triggerEvent: 'streak.updated',
    conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 30 },
    verificationLevel: 'A_AUTOMATIC',
    verificationQueryJson: { sql: "SELECT COUNT(DISTINCT date) FROM streak_days WHERE user_id = $1 AND status = 'ACTIVE' AND date >= CURRENT_DATE - 30" } },
  { badgeSlug: 'first-session', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 1 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'sessions-10', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 10 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'eight-exercises', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'distinct_count', field: 'exercise_type_id', gte: 8 },
    verificationLevel: 'A_AUTOMATIC' },
  // --- streak family (1) ---
  { badgeSlug: 'streak-100', triggerEvent: 'streak.updated',
    conditionDslJson: { type: 'threshold', field: 'current_streak', gte: 100 },
    verificationLevel: 'A_AUTOMATIC',
    verificationQueryJson: { sql: "SELECT COUNT(DISTINCT date) FROM streak_days WHERE user_id = $1 AND status = 'ACTIVE' AND date >= CURRENT_DATE - 100" } },
  // --- sessions family (2) ---
  { badgeSlug: 'sessions-50', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 50 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'sessions-200', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 200 },
    verificationLevel: 'A_AUTOMATIC' },
  // --- words family (3) ---
  { badgeSlug: 'words-1000', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'words_total', gte: 1000 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'words-10000', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'words_total', gte: 10000 },
    verificationLevel: 'A_AUTOMATIC' },
  { badgeSlug: 'words-100000', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'words_total', gte: 100000 },
    verificationLevel: 'A_AUTOMATIC' },
  // --- exploration (3): all-basic-categories / all-banks need per-row data → B_MANUAL (deferred) ---
  { badgeSlug: 'all-basic-categories', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'distinct_count', field: 'exercise_category', gte: 4 },
    verificationLevel: 'F_MANUAL' },
  { badgeSlug: 'all-banks', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'distinct_count', field: 'bank_source_type', gte: 10 },
    verificationLevel: 'F_MANUAL' },
  // --- quality (3): five-senses / six-word / hundred-word need per-row data → B_MANUAL (deferred) ---
  { badgeSlug: 'five-senses-complete', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'distinct_count', field: 'sense', gte: 5 },
    verificationLevel: 'F_MANUAL' },
  { badgeSlug: 'six-word-master', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 10 },
    verificationLevel: 'F_MANUAL' },
  { badgeSlug: 'hundred-word-master', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 10 },
    verificationLevel: 'F_MANUAL' },
  // --- quality (1): first show-dont-tell → A_AUTOMATIC ---
  { badgeSlug: 'first-show-dont-tell', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 1 },
    verificationLevel: 'A_AUTOMATIC' },
  // --- hidden (2) ---
  { badgeSlug: 'night-owl', triggerEvent: 'exercise_submitted',
    conditionDslJson: { type: 'threshold', field: 'sessions_count', gte: 1 },
    verificationLevel: 'F_MANUAL' },
  { badgeSlug: 'phoenix-return', triggerEvent: 'streak.updated',
    conditionDslJson: { type: 'threshold', field: 'best_streak', gte: 3 },
    verificationLevel: 'F_MANUAL' },
] as const;

// ---------- I.5 Characters (100) ----------
// 100 authored with variety (gender/age/temperament/tone/class/region/era) — see seedData/characters.ts
const characters = seedCharacters as any[];

// ---------- I.6 OpeningLines (100) ----------
// 100 authored with variety (genre/mood/difficulty) — see seedData/openingLines.ts
const openings = seedOpeningLines as any[];

// ---------- I.7 Places (100) ----------
// 100 places across شهری/طبیعی/خانگی/متحرک/صنعتی — see seedData/places.ts
const places = seedPlaces as any[];

// ---------- I.8 Emotions (100) ----------
// 100 emotion-lexicon items across 19 categories — see seedData/emotionLexicon.ts
const emotions = seedEmotionLexicon as any[];

// ---------- I.8b Objects (100, for write-with-object) ----------
// Categories: قدیمی / نو / برقی / پوشاک / شخصی / عمومی — see seedData/objectItems.ts
const objects = seedObjectItems as any[];

// ---------- I.8c Cutup texts (50, for cut-up) ----------
// textType: literary (20) / news (15) / essay (15) — see seedData/cutupTexts.ts
const cutupTexts = seedCutupTexts as any[];

// ---------- I.8d StyleParagraphs (100, for style-imitation) ----------
// 100 items: genuine widely-documented public-domain quotes (real author/work/year)
// + original KarGah Persian paragraphs (author: 'اصیل — نوشته‌ی کارگاه').
// No fabricated quotes. See seedData/styleParagraphs.ts
const styleParagraphs = seedStyleParagraphs as any[];

// ---------- I.8e ReferenceStories (100, for rewrite-famous-story & remove-a-scene) ----------
// 100 stories: mix of genuine public-domain attributions (ایسوپ/فردوسی/هزارویک‌شب/
// برادران‌گریم/تولستوی) and original content (author: null / 'اصیل — نوشته‌ی کارگاه').
// See seedData/referenceStories.ts
const referenceStories = seedReferenceStories as any[];

// ---------- I.8f Words (100, for clustering) ----------
// 100 common Persian nouns/verbs/adjectives with part-of-speech tags — see seedData/words.ts
// `pos` values: 'اسم' (noun), 'فعل' (verb), 'صفت' (adjective).
// `isConcrete` true for physical/tangible words, false for abstract words.
const words = seedWords as any[];

// ---------- I.8g WhatIfQuestions (100, for start-from-question) ----------
// target: genre (30) | emotion (25) | conflict (25) | social (20) — see seedData/whatIfQuestions.ts
const whatIfQuestions = seedWhatIfQuestions as any[];

// ---------- I.8h AmbientAudios (8, for music-writer) ----------
// DECISION: fileUrl values are placeholder paths (/audio/ambient/*.mp3) —
// actual audio files must be placed in the public serving directory.
const ambientAudios = [
  { name: 'باران روی پشت‌بام', type: 'rain', fileUrl: '/audio/ambient/rain.mp3', license: 'royalty-free' },
  { name: 'کافه‌ی شلوغ', type: 'cafe', fileUrl: '/audio/ambient/cafe.mp3', license: 'royalty-free' },
  { name: 'جای دریا', type: 'waves', fileUrl: '/audio/ambient/ocean-waves.mp3', license: 'royalty-free' },
  { name: 'باد در جنگل', type: 'wind', fileUrl: '/audio/ambient/forest-wind.mp3', license: 'royalty-free' },
  { name: 'جیرجیرک شب', type: 'crickets', fileUrl: '/audio/ambient/crickets.mp3', license: 'royalty-free' },
  { name: 'قطره‌های آب', type: 'drip', fileUrl: '/audio/ambient/water-drip.mp3', license: 'royalty-free' },
  { name: 'طنین زنگوله', type: 'bells', fileUrl: '/audio/ambient/bells.mp3', license: 'royalty-free' },
  { name: 'موسیقی پیانوی آرام', type: 'piano', fileUrl: '/audio/ambient/calm-piano.mp3', license: 'royalty-free' },
];

// ---------- I.9 News (100) ----------
// 100 Persian news items with stable hashes (seed_news_101..200) — see seedData/newsItems.ts
// Hashes are @unique for idempotent upsert; publishedAt is ISO string → Date at seed time.
const news = seedNewsItems as any[];

// ---------- I.10 Quests (3) ----------
const quests = [
  { slug: 'daily.today-exercise', titleFa: 'تمرین امروز', type: 'daily',
    conditionJson: { exercise_submitted: 1 }, rewardXp: 0, rewardInk: 5 },
  { slug: 'daily.one-variety', titleFa: 'یک تمرین از دسته متفاوت', type: 'daily',
    conditionJson: { exercise_from_least_category: 1 }, rewardXp: 20, rewardInk: 3 },
  // DECISION: daily.reflection is seeded but INACTIVE — there is no reflection
  // model/table in the schema yet, so its condition (reflection_word_min: 30)
  // cannot be evaluated. It stays in the seed so activating it later is a
  // single isActive flip, not a data migration.
  { slug: 'daily.reflection', titleFa: 'یک بازتاب کوتاه بنویس', type: 'daily',
    conditionJson: { reflection_word_min: 30 }, rewardXp: 10, rewardInk: 2, isActive: false },
] as const;

// ---------- H.3 Feature Flags ----------
const settings = [
  { key: 'feature.pwa.enabled', valueJson: true },
  { key: 'feature.realtime.enabled', valueJson: false },
  { key: 'feature.mentorship.enabled', valueJson: false },
  { key: 'feature.community.enabled', valueJson: false },
  { key: 'feature.league.enabled', valueJson: false },
  { key: 'feature.hidden_badges.enabled', valueJson: true },
  { key: 'feature.zen_mode.default', valueJson: 'BALANCED' },
];

async function main() {
  console.log('Seeding...');

  // 1. ExerciseTypes (upsert by slug)
  for (const ex of exercises) {
    await prisma.exerciseType.upsert({
      where: { slug: ex.slug },
      create: { ...ex },
      update: { ...ex },
    });
  }

  // 2. Badges (upsert by slug)
  for (const b of badges) {
    await prisma.badge.upsert({
      where: { slug: b.slug },
      create: { ...b },
      update: { ...b },
    });
  }

  // 3. BadgeRules (findFirst guard — idempotent)
  for (const r of rules) {
    const badge = await prisma.badge.findUnique({ where: { slug: r.badgeSlug } });
    if (!badge) continue;
    const existing = await prisma.badgeRule.findFirst({ where: { badgeId: badge.id, triggerEvent: r.triggerEvent } });
    if (!existing) {
      await prisma.badgeRule.create({
        data: {
          badgeId: badge.id,
          triggerEvent: r.triggerEvent,
          conditionDslJson: r.conditionDslJson as unknown as object,
          verificationLevel: r.verificationLevel as never,
          verificationQueryJson: (r as { verificationQueryJson?: unknown }).verificationQueryJson as unknown as object,
        },
      });
    }
  }

  // 4. Characters (upsert by name — idempotent)
  for (const c of characters) {
    const existing = await prisma.character.findFirst({ where: { name: c.name } });
    if (!existing) await prisma.character.create({ data: { ...c } });
  }

  // 5. OpeningLines (upsert by text — idempotent)
  for (const o of openings) {
    const existing = await prisma.openingLine.findFirst({ where: { text: o.text } });
    if (!existing) await prisma.openingLine.create({ data: { ...o } });
  }

  // 6. Places (upsert by name — idempotent)
  for (const p of places) {
    const existing = await prisma.place.findFirst({ where: { name: p.name } });
    if (!existing) await prisma.place.create({ data: { ...p } });
  }

  // 7. Emotions (upsert by word — idempotent)
  for (const e of emotions) {
    const existing = await prisma.emotionLexicon.findFirst({ where: { word: e.word } });
    if (!existing) await prisma.emotionLexicon.create({ data: { ...e } });
  }

  // 8. News (upsert by hash — idempotent, hash is @unique)
  // publishedAt is an ISO string in seedData — coerce to Date for DateTime column.
  for (const n of news) {
    const data = { ...n, publishedAt: new Date(n.publishedAt) };
    await prisma.newsItem.upsert({
      where: { hash: n.hash },
      create: data,
      update: data,
    });
  }

  // 9. Quests (upsert by slug)
  for (const q of quests) {
    await prisma.quest.upsert({
      where: { slug: q.slug },
      create: { ...q },
      update: { ...q },
    });
  }

  // 9b. Objects (idempotent by name)
  for (const o of objects) {
    const existing = await prisma.objectItem.findFirst({ where: { name: o.name } });
    if (!existing) await prisma.objectItem.create({ data: { ...o } });
  }

  // 9c. Cutup texts (idempotent by text)
  for (const c of cutupTexts) {
    const existing = await prisma.cutupText.findFirst({ where: { text: c.text } });
    if (!existing) await prisma.cutupText.create({ data: { ...c } });
  }

  // 9d. WhatIfQuestions (idempotent by question text)
  for (const w of whatIfQuestions) {
    const existing = await prisma.whatIfQuestion.findFirst({ where: { question: w.question } });
    if (!existing) await prisma.whatIfQuestion.create({ data: { ...w } });
  }

  // 9e. AmbientAudios (idempotent by name)
  for (const a of ambientAudios) {
    const existing = await prisma.ambientAudio.findFirst({ where: { name: a.name } });
    if (!existing) await prisma.ambientAudio.create({ data: { ...a } });
  }

  // 9f. Words (idempotent by text — text is @unique)
  for (const w of words) {
    const existing = await prisma.word.findUnique({ where: { text: w.text } });
    if (!existing) await prisma.word.create({ data: { ...w } });
  }

  // 9g. StyleParagraphs (idempotent by originalText — no unique key in schema)
  for (const sp of styleParagraphs) {
    const existing = await prisma.styleParagraph.findFirst({
      where: { originalText: sp.originalText },
    });
    if (!existing) await prisma.styleParagraph.create({ data: { ...sp } });
  }

  // 9h. ReferenceStories (idempotent by title — no unique key in schema)
  for (const rs of referenceStories) {
    const existing = await prisma.referenceStory.findFirst({ where: { title: rs.title } });
    if (!existing) await prisma.referenceStory.create({ data: { ...rs } });
  }

  // 9i. StructurePhrases (idempotent by text + stage — no unique key in schema)
  for (const sp of seedStructurePhrases) {
    const existing = await prisma.structurePhrase.findFirst({
      where: { text: sp.text, stage: sp.stage },
    });
    if (!existing) await prisma.structurePhrase.create({ data: { ...sp } });
  }

  // 9j. ImageAssets (idempotent by url — no unique key in schema)
  for (const img of seedImageAssets) {
    const existing = await prisma.imageAsset.findFirst({ where: { url: img.url } });
    if (!existing) await prisma.imageAsset.create({ data: { ...img } });
  }

  // 9k. StructureTemplates (upsert by slug — slug is @unique)
  for (const st of seedStructureTemplates) {
    await prisma.structureTemplate.upsert({
      where: { slug: st.slug },
      create: { name: st.name, slug: st.slug, steps: st.steps as unknown as object, description: st.description, example: st.example ?? null, isActive: true },
      update: { name: st.name, steps: st.steps as unknown as object, description: st.description, example: st.example ?? null },
    });
  }

  // 10. SystemSettings (upsert by key)
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, valueJson: s.valueJson as unknown as object },
      update: { valueJson: s.valueJson as unknown as object },
    });
  }

  // 11. Initial Admin User (دکتر محمد بختیاری)
  await prisma.user.upsert({
    where: { email: 'hajmamad.b@gmail.com' },
    create: {
      email: 'hajmamad.b@gmail.com',
      passwordHash:
        '$argon2id$v=19$m=19456,t=2,p=1$lw7z+SeMyA44SaoyhCI7Fw$x35Uzhi4lYSCgpMz9/jqN+kpUqPyewCOSJFl1Di3Iq8',
      displayName: 'دکتر محمد بختیاری',
      role: 'ADMIN',
      level: 10,
      emailVerified: true,
      isActive: true,
    },
    update: {
      passwordHash:
        '$argon2id$v=19$m=19456,t=2,p=1$lw7z+SeMyA44SaoyhCI7Fw$x35Uzhi4lYSCgpMz9/jqN+kpUqPyewCOSJFl1Di3Iq8',
      displayName: 'دکتر محمد بختیاری',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
