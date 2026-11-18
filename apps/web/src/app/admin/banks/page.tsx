'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Search,
  CheckCircle,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Filter,
  Eye,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { formatDate, toPersianDigits } from '@/lib/utils/persian';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';

// ── Bank definitions ──

export const BANKS: { type: string; label: string }[] = [
  { type: 'CHARACTER', label: 'شخصیت' },
  { type: 'PLACE', label: 'مکان' },
  { type: 'OPENING_LINE', label: 'جمله‌ی آغازین' },
  { type: 'STYLE_PARAGRAPH', label: 'پاراگراف سبکی' },
  { type: 'REFERENCE_STORY', label: 'داستان مرجع' },
  { type: 'NEWS', label: 'خبر' },
  { type: 'IMAGE', label: 'تصویر' },
  { type: 'OBJECT', label: 'شیء' },
  { type: 'EMOTION', label: 'واژگان احساسی' },
  { type: 'WHAT_IF', label: 'اگر…چه؟' },
  { type: 'WORD', label: 'کلمه' },
  { type: 'STRUCTURE_PHRASE', label: 'عبارت ساختاری' },
  { type: 'CUTUP_TEXT', label: 'متن بریده' },
];

// ── Per-bank form field config ──

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'datetime';
  required?: boolean;
}

const COMMON_FIELDS: FieldDef[] = [
  { key: 'isActive', label: 'وضعیت فعال بودن (در دسترس کاربران برای تمرین)', type: 'boolean' },
];

const BANK_FIELDS: Record<string, FieldDef[]> = {
  CHARACTER: [
    { key: 'name', label: 'نام', type: 'text', required: true },
    { key: 'gender', label: 'جنسیت', type: 'text' },
    { key: 'ageRange', label: 'بازه سنی', type: 'text' },
    { key: 'temperament', label: 'خلق‌وخو', type: 'text' },
    { key: 'tone', label: 'لحن', type: 'text' },
    { key: 'background', label: 'پس‌زمینه و پیشینه', type: 'textarea' },
    { key: 'occupation', label: 'شغل و حرفه', type: 'text' },
    { key: 'socialClass', label: 'پایگاه اجتماعی', type: 'text' },
    { key: 'historicalEra', label: 'دوره تاریخی', type: 'text' },
    { key: 'region', label: 'منطقه و بوم', type: 'text' },
    { key: 'tags', label: 'برچسب‌ها (با ویرگول جدا کنید)', type: 'text' },
    { key: 'source', label: 'منبع', type: 'text' },
    ...COMMON_FIELDS,
  ],
  PLACE: [
    { key: 'name', label: 'نام مکان', type: 'text', required: true },
    { key: 'type', label: 'نوع مکان (شهری، طبیعت، تاریخی و...)', type: 'text', required: true },
    { key: 'description', label: 'توصیف مکان و فضا', type: 'textarea' },
    { key: 'suggestedSenses', label: 'حس‌های پیشنهادی (با ویرگول جدا کنید: بینایی، بویایی و...)', type: 'text' },
    ...COMMON_FIELDS,
  ],
  OPENING_LINE: [
    { key: 'text', label: 'جمله آغازین', type: 'textarea', required: true },
    { key: 'genre', label: 'زیرگونه / فضا', type: 'text' },
    { key: 'mood', label: 'حس‌وحال', type: 'text' },
    { key: 'difficulty', label: 'سطح دشواری (۱ تا ۵)', type: 'number' },
    ...COMMON_FIELDS,
  ],
  STYLE_PARAGRAPH: [
    { key: 'originalText', label: 'متن اصلی', type: 'textarea', required: true },
    { key: 'translation', label: 'ترجمه (در صورت وجود)', type: 'textarea' },
    { key: 'author', label: 'نویسنده', type: 'text' },
    { key: 'work', label: 'اثر / کتاب', type: 'text' },
    { key: 'translator', label: 'مترجم', type: 'text' },
    { key: 'year', label: 'سال انتشار', type: 'number' },
    { key: 'language', label: 'زبان', type: 'text' },
    { key: 'styleFeature', label: 'ویژگی و تکنیک سبکی', type: 'textarea' },
    { key: 'copyrightStatus', label: 'وضعیت حق نشر', type: 'text' },
    ...COMMON_FIELDS,
  ],
  REFERENCE_STORY: [
    { key: 'title', label: 'عنوان داستان', type: 'text', required: true },
    { key: 'text', label: 'متن داستان', type: 'textarea', required: true },
    { key: 'author', label: 'نویسنده', type: 'text' },
    { key: 'translator', label: 'مترجم', type: 'text' },
    { key: 'year', label: 'سال نگارش', type: 'number' },
    { key: 'length', label: 'تعداد واژگان', type: 'number', required: true },
    { key: 'genre', label: 'زیرگونه', type: 'text' },
    { key: 'copyrightStatus', label: 'وضعیت حق نشر', type: 'text' },
    ...COMMON_FIELDS,
  ],
  NEWS: [
    { key: 'title', label: 'تیتر خبر', type: 'text', required: true },
    { key: 'summary', label: 'خلاصه و لید خبر', type: 'textarea', required: true },
    { key: 'fullText', label: 'متن کامل خبر', type: 'textarea' },
    { key: 'sourceName', label: 'نام خبرگزاری / منبع', type: 'text', required: true },
    { key: 'sourceUrl', label: 'لینک اصل خبر', type: 'text', required: true },
    { key: 'publishedAt', label: 'تاریخ انتشار در رسانه', type: 'datetime', required: true },
    { key: 'category', label: 'دسته‌بندی موضوعی', type: 'text', required: true },
    { key: 'isSensitive', label: 'محتوای حساس / نیازمند هشدار', type: 'boolean' },
    { key: 'status', label: 'وضعیت تایید و انتشار (APPROVED / REJECTED)', type: 'text' },
  ],
  IMAGE: [
    { key: 'url', label: 'آدرس مستقیم تصویر', type: 'text', required: true },
    { key: 'thumbnailUrl', label: 'آدرس بندانگشتی', type: 'text' },
    { key: 'description', label: 'توصیف بصری و فضا', type: 'textarea' },
    { key: 'photographer', label: 'عکاس یا خالق اثر', type: 'text' },
    { key: 'license', label: 'مجوز و لایسنس', type: 'text', required: true },
    { key: 'licenseUrl', label: 'آدرس مجوز', type: 'text' },
    { key: 'source', label: 'منبع دریافت', type: 'textarea' },
    { key: 'topic', label: 'موضوع', type: 'text' },
    { key: 'mood', label: 'حس‌وحال', type: 'text' },
    { key: 'category', label: 'دسته', type: 'text' },
    ...COMMON_FIELDS,
  ],
  OBJECT: [
    { key: 'name', label: 'نام شیء', type: 'text', required: true },
    { key: 'category', label: 'دسته‌بندی شیء', type: 'text', required: true },
    { key: 'description', label: 'توصیف ظاهری و جزئیات ملموس', type: 'textarea' },
    { key: 'imageUrl', label: 'آدرس تصویر شیء', type: 'text' },
    ...COMMON_FIELDS,
  ],
  EMOTION: [
    { key: 'word', label: 'واژه / حالت احساسی', type: 'text', required: true },
    { key: 'emotion', label: 'احساس پایه (ترس، خشم، امید و...)', type: 'text', required: true },
    { key: 'intensity', label: 'شدت احساس (۱ تا ۵)', type: 'number' },
    { key: 'showSample', label: 'نمونه نشان دادن به جای گفتن', type: 'textarea' },
    { key: 'synonyms', label: 'واژه‌های هم‌خانواده (با ویرگول جدا کنید)', type: 'text' },
    ...COMMON_FIELDS,
  ],
  WHAT_IF: [
    { key: 'question', label: 'پرسش اگر… چه؟', type: 'textarea', required: true },
    { key: 'target', label: 'هدف ایده (داستان، پیرنگ، فضا)', type: 'text', required: true },
    { key: 'difficulty', label: 'سطح دشواری (۱ تا ۵)', type: 'number' },
    ...COMMON_FIELDS,
  ],
  WORD: [
    { key: 'text', label: 'کلمه', type: 'text', required: true },
    { key: 'pos', label: 'نقش دستوری (اسم، فعل، صفت، قید)', type: 'text' },
    { key: 'frequency', label: 'بسامد و رتبه کاربری', type: 'number' },
    { key: 'semanticTags', label: 'برچسب‌های معنایی (با ویرگول جدا کنید)', type: 'text' },
    { key: 'isConcrete', label: 'واژه عینی و ملموس', type: 'boolean' },
    ...COMMON_FIELDS,
  ],
  STRUCTURE_PHRASE: [
    { key: 'text', label: 'متن یا عبارت ساختاری', type: 'textarea', required: true },
    { key: 'stage', label: 'مرحله روایی (آغاز، میانه، گره‌افکنی، فرود)', type: 'text', required: true },
    ...COMMON_FIELDS,
  ],
  CUTUP_TEXT: [
    { key: 'text', label: 'متن بریده', type: 'textarea', required: true },
    { key: 'source', label: 'منبع متن اصلی', type: 'text' },
    { key: 'length', label: 'طول تقریبی (کلمات)', type: 'number', required: true },
    { key: 'textType', label: 'نوع متن (نظم، نثر، ژورنالیستی)', type: 'text', required: true },
    ...COMMON_FIELDS,
  ],
};

// ── Item preview ──

function describeItem(type: string, r: Record<string, unknown>) {
  const s = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;
  const num = (v: unknown): string | undefined =>
    typeof v === 'number' ? String(v) : undefined;
  switch (type) {
    case 'CHARACTER':
      return {
        title: s(r.name),
        content: s(r.background),
        hint: [s(r.occupation), s(r.temperament), s(r.ageRange)].filter(Boolean).join(' · ') || undefined,
      };
    case 'PLACE': {
      const senses = Array.isArray(r.suggestedSenses) ? (r.suggestedSenses as string[]) : [];
      return {
        title: s(r.name),
        content: s(r.description),
        hint: [s(r.type), senses.length ? `حس‌ها: ${senses.join('، ')}` : null].filter(Boolean).join(' · ') || undefined,
      };
    }
    case 'OPENING_LINE':
      return { title: 'جمله‌ی آغازین', content: s(r.text), hint: [s(r.genre), s(r.mood)].filter(Boolean).join(' · ') || undefined };
    case 'NEWS':
      return {
        title: s(r.title),
        content: s(r.summary) ?? s(r.fullText),
        hint:
          [
            s(r.sourceName) && `منبع: ${r.sourceName}`,
            s(r.publishedAt) && `انتشار: ${formatDate(r.publishedAt as string, 'persian', true)}`,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      };
    case 'STYLE_PARAGRAPH':
      return {
        title: [s(r.author), s(r.work), num(r.year)].filter(Boolean).join('، ') || 'نمونه‌ی سبکی',
        content: s(r.originalText),
        hint: s(r.styleFeature) ? `ویژگی سبکی: ${r.styleFeature}` : undefined,
      };
    case 'REFERENCE_STORY':
      return { title: s(r.title), content: s(r.text), hint: [s(r.author), s(r.genre)].filter(Boolean).join(' · ') || undefined };
    case 'IMAGE':
      return { title: s(r.topic) || 'تصویر', content: s(r.description), hint: s(r.photographer) ? `عکاس: ${r.photographer}` : undefined };
    case 'OBJECT':
      return { title: s(r.name), content: s(r.description), hint: s(r.category) ? `دسته: ${r.category}` : undefined };
    case 'EMOTION':
      return { title: s(r.word), content: s(r.showSample), hint: s(r.emotion) ? `احساس: ${r.emotion}` : undefined };
    case 'WHAT_IF':
      return { title: 'ایده اگر… چه؟', content: s(r.question), hint: s(r.target) ? `هدف: ${r.target}` : undefined };
    case 'STRUCTURE_PHRASE':
      return { title: 'عبارت ساختاری', content: s(r.text), hint: s(r.stage) ? `مرحله: ${r.stage}` : undefined };
    case 'WORD':
      return { title: s(r.text), content: s(r.pos) ? `نقش دستوری: ${r.pos}` : undefined, hint: num(r.frequency) ? `بسامد: ${r.frequency}` : undefined };
    case 'CUTUP_TEXT':
      return { title: 'متن بریده', content: s(r.text), hint: s(r.source) ? `منبع: ${r.source}` : undefined };
    default:
      return {
        title: s(r.title) ?? s(r.name) ?? s(r.text),
        content: s(r.text) ?? s(r.contentText),
      };
  }
}

// ── Check if item is active ──
function isItemActive(type: string, r: Record<string, unknown>): boolean {
  if (type === 'NEWS') {
    return r.status === 'APPROVED';
  }
  return r.isActive !== false;
}

// ── Form helpers ──

function rowToFormValues(type: string, r: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of BANK_FIELDS[type] ?? []) {
    const v = r[f.key];
    if (v === null || v === undefined) {
      if (f.key === 'isActive') values[f.key] = 'true';
      else values[f.key] = '';
    } else if (f.type === 'boolean') {
      values[f.key] = v ? 'true' : 'false';
    } else if (f.type === 'datetime') {
      values[f.key] = new Date(v as string | number | Date).toISOString().slice(0, 16);
    } else if (Array.isArray(v)) {
      values[f.key] = (v as unknown[]).join(', ');
    } else {
      values[f.key] = String(v);
    }
  }
  return values;
}

function formValuesToBody(type: string, values: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of BANK_FIELDS[type] ?? []) {
    const v = values[f.key];
    if (v === '' && !f.required) continue;
    switch (f.type) {
      case 'number':
        body[f.key] = v === '' ? undefined : Number(v);
        break;
      case 'boolean':
        body[f.key] = v === 'true';
        break;
      case 'datetime':
        body[f.key] = new Date(v).toISOString();
        break;
      case 'text':
      case 'textarea':
        body[f.key] = v;
        break;
    }
  }
  return body;
}

// ── Page Component ──

export default function AdminBanksPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  const [bankType, setBankType] = useState('CHARACTER');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Delete modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggling state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['admin-banks', bankType],
    enabled: isAdmin,
    staleTime: 30 * 1000,
    queryFn: () => api.get<Record<string, unknown>[]>(`/admin/banks/${bankType}`),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-banks', bankType] });

  const closeForm = () => {
    setAdding(false);
    setEditingId(null);
    setFormValues({});
    setError(null);
  };

  const openAdd = () => {
    setEditingId(null);
    setAdding(true);
    setFormValues({ isActive: 'true' });
    setError(null);
  };

  const openEdit = (row: Record<string, unknown>) => {
    setAdding(false);
    setEditingId(String(row.id));
    setFormValues(rowToFormValues(bankType, row));
    setError(null);
  };

  const save = async () => {
    const body = formValuesToBody(bankType, formValues);
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/admin/banks/${bankType}/${editingId}`, body);
        toast.success('تغییرات آیتم با موفقیت ذخیره شد.');
      } else {
        await api.post(`/admin/banks/${bankType}`, body);
        toast.success('آیتم جدید با موفقیت به بانک اضافه شد.');
      }
      invalidate();
      closeForm();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'خطا در ذخیره‌سازی آیتم';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/banks/${bankType}/${deleteTargetId}`);
      toast.success('آیتم مورد نظر با موفقیت از بانک حذف شد.');
      invalidate();
      setDeleteTargetId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در حذف آیتم');
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (row: Record<string, unknown>) => {
    const id = String(row.id);
    setTogglingId(id);
    const currentlyActive = isItemActive(bankType, row);
    try {
      await api.patch(`/admin/banks/${bankType}/${id}/toggle-active`, {});
      toast.success(
        currentlyActive
          ? 'آیتم غیرفعال شد و دیگر به کاربران پیشنهاد نمی‌شود.'
          : 'آیتم با موفقیت فعال و وارد چرخه تمرین‌ها شد.',
      );
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در تغییر وضعیت فعال‌سازی');
    } finally {
      setTogglingId(null);
    }
  };

  // Filtered rows based on search and status
  const filteredData = useMemo(() => {
    const data = listQuery.data ?? [];
    return data.filter((row) => {
      const active = isItemActive(bankType, row);
      if (statusFilter === 'ACTIVE' && !active) return false;
      if (statusFilter === 'INACTIVE' && active) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const d = describeItem(bankType, row);
      const textPool = `${d.title ?? ''} ${d.content ?? ''} ${d.hint ?? ''}`.toLowerCase();
      return textPool.includes(q);
    });
  }, [listQuery.data, bankType, statusFilter, searchQuery]);

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-sm text-text-secondary">در حال بررسی هویت…</p>
        </div>
      </AppShell>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <AlertCircle className="w-10 h-10 text-danger" />
          <h1 className="text-lg font-bold">دسترسی مجاز نیست</h1>
          <p className="text-sm text-text-secondary">
            این بخش به صورت اختصاصی فقط برای مدیر کل پلتفرم قابل دسترسی است.
          </p>
        </div>
      </AppShell>
    );
  }

  const currentBank = BANKS.find((b) => b.type === bankType)!;
  const fields = BANK_FIELDS[bankType] ?? [];
  const formOpen = adding || editingId !== null;

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary">مدیریت بانک‌های محتوا</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
                مدیریت کل
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-1">
              مشاهده، افزودن، ویرایش، حذف و فعال یا غیرفعال کردن سوژه‌ها و آیتم‌های تمام بانک‌ها
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition-all shadow-sm"
          >
            <Plus size={16} />
            <span>افزودن سوژه جدید به {currentBank.label}</span>
          </button>
        </div>

        {/* Bank selector pills */}
        <div className="flex flex-wrap gap-1.5">
          {BANKS.map((b) => {
            const isSelected = bankType === b.type;
            return (
              <button
                key={b.type}
                onClick={() => {
                  setBankType(b.type);
                  closeForm();
                  setSearchQuery('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  isSelected
                    ? 'border-accent bg-accent text-white shadow-sm'
                    : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary hover:border-accent/40'
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Form Modal / Drawer */}
        {formOpen && (
          <div className="rounded-xl border border-accent/40 bg-bg-secondary p-5 space-y-4 shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-accent" />
                <h2 className="text-sm font-bold text-text-primary">
                  {editingId ? `ویرایش آیتم در بانک «${currentBank.label}»` : `افزودن آیتم جدید به «${currentBank.label}»`}
                </h2>
              </div>
              <button
                onClick={closeForm}
                className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="text-xs font-medium text-text-secondary block mb-1.5">
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={formValues[f.key] ?? ''}
                      onChange={(e) => setFormValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      rows={3}
                      className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm focus:border-accent focus:outline-none"
                      dir="rtl"
                    />
                  ) : f.type === 'boolean' ? (
                    <select
                      value={formValues[f.key] ?? 'true'}
                      onChange={(e) => setFormValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm focus:border-accent focus:outline-none"
                    >
                      <option value="true">بله (فعال / قابل استفاده در تمرین‌ها)</option>
                      <option value="false">خیر (غیرفعال و پنهان از چرخه تمرین)</option>
                    </select>
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'}
                      value={formValues[f.key] ?? ''}
                      onChange={(e) => setFormValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      step={f.type === 'number' ? '1' : undefined}
                      className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm focus:border-accent focus:outline-none"
                      dir={f.type === 'datetime' ? 'ltr' : 'rtl'}
                    />
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded-md text-xs text-danger">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-accent text-white px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{saving ? 'در حال ذخیره‌سازی…' : 'ذخیره آیتم'}</span>
              </button>
              <button
                onClick={closeForm}
                className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-bg-secondary border border-border rounded-xl p-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              placeholder={`جستجو در ${currentBank.label}‌ها…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-bg-primary py-2 pr-9 pl-3 text-xs placeholder:text-text-secondary focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-text-secondary">فیلتر وضعیت:</span>
            <div className="flex rounded-lg border border-border bg-bg-primary p-0.5 text-xs">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-accent text-white font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                همه ({toPersianDigits(listQuery.data?.length ?? 0)})
              </button>
              <button
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-emerald-600 text-white font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                فعال‌ها
              </button>
              <button
                onClick={() => setStatusFilter('INACTIVE')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === 'INACTIVE'
                    ? 'bg-rose-600 text-white font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                غیرفعال‌ها
              </button>
            </div>
          </div>
        </div>

        {/* Item list */}
        <div className="rounded-xl border border-border bg-bg-secondary shadow-sm overflow-hidden">
          <div className="border-b border-border px-4 py-3 bg-bg-primary/50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span>فهرست سوژه‌های {currentBank.label}</span>
              <span className="text-xs text-text-secondary font-normal">
                (نمایش {toPersianDigits(filteredData.length)} از{' '}
                {toPersianDigits(listQuery.data?.length ?? 0)} آیتم)
              </span>
            </h2>
          </div>

          {listQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-secondary">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              <span>در حال بارگذاری سوژه‌ها…</span>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-secondary">
              {searchQuery || statusFilter !== 'ALL'
                ? 'با فیلترهای انتخابی آیتمی یافت نشد.'
                : 'هنوز هیچ آیتمی در این بانک ثبت نشده است.'}
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[680px] overflow-y-auto">
              {filteredData.map((row) => {
                const id = String(row.id);
                const d = describeItem(bankType, row);
                const active = isItemActive(bankType, row);
                const isToggling = togglingId === id;

                return (
                  <div
                    key={id}
                    className={`flex items-start justify-between gap-4 px-4 py-3.5 transition-colors ${
                      !active ? 'bg-bg-tertiary/40 opacity-75' : 'hover:bg-bg-primary/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary">
                          {d.title ?? 'بدون عنوان'}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                            active
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {active ? (
                            <>
                              <CheckCircle size={11} />
                              فعال (در دسترس)
                            </>
                          ) : (
                            <>
                              <XCircle size={11} />
                              غیرفعال (محروم از تمرین)
                            </>
                          )}
                        </span>
                      </div>

                      {d.content && (
                        <p className="text-xs text-text-secondary leading-relaxed line-clamp-3" dir="rtl">
                          {d.content}
                        </p>
                      )}

                      {d.hint && (
                        <p className="text-[11px] text-text-secondary/80 font-mono" dir="rtl">
                          {d.hint}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {/* Toggle Active Button */}
                      <button
                        onClick={() => toggleActive(row)}
                        disabled={isToggling}
                        title={active ? 'کلیک کنید تا این سوژه غیرفعال شود' : 'کلیک کنید تا این سوژه فعال شود'}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                          active
                            ? 'border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                        }`}
                      >
                        {isToggling ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : active ? (
                          <>
                            <ToggleRight size={14} className="text-emerald-500" />
                            <span>غیرفعال‌سازی</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft size={14} className="text-rose-500" />
                            <span>فعال‌سازی</span>
                          </>
                        )}
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEdit(row)}
                        className="p-1.5 rounded-md text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                        title="ویرایش جزئیات این سوژه"
                      >
                        <Pencil size={15} />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => setDeleteTargetId(id)}
                        className="p-1.5 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                        title="حذف کامل از پایگاه داده"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
        title="حذف آیتم از بانک محتوا"
        description="آیا از حذف این آیتم اطمینان دارید؟ این عمل داده را از بانک حذف می‌کند و قابل بازگشت نیست. اگر تنها قصد دارید این آیتم در تمرین‌ها نیاید، پیشنهاد می‌شود آن را «غیرفعال» کنید."
        confirmText="بله، برای همیشه حذف کن"
        cancelText="انصراف"
        variant="danger"
        isLoading={deleting}
      />
    </AppShell>
  );
}
