import {
  BankType,
  Prisma,
  PrismaClient,
  Character,
  Place,
  OpeningLine,
  StyleParagraph,
  ReferenceStory,
  NewsItem,
  ImageAsset,
  ObjectItem,
  EmotionLexicon,
  WhatIfQuestion,
  StructurePhrase,
  Word,
  CutupText,
  StructureTemplate,
} from '@prisma/client';

/**
 * A bank item as returned by the selectors. Union of the Prisma row types
 * that have a model in the schema (phase-1 subset of the 16-value BankType
 * enum). `id` is always present.
 */
export type BankItem =
  | Character
  | Place
  | OpeningLine
  | StyleParagraph
  | ReferenceStory
  | NewsItem
  | ImageAsset
  | ObjectItem
  | EmotionLexicon
  | WhatIfQuestion
  | StructurePhrase
  | Word
  | CutupText
  | StructureTemplate;

export interface SelectorInput {
  userId: string;
  bankType: BankType;
  sessionId?: string;
  filters?: Record<string, unknown>;
  excludeIds?: string[];
}

export interface SelectorOutput {
  item: BankItem;
  selectionLogId: string;
  cyclePosition?: string;
}

export interface IBankSelector {
  select(input: SelectorInput): Promise<SelectorOutput>;
}

/**
 * Prisma client accessor name for each phase-1 BankType.
 * DECISION: only banks that have a model in the schema AND are used by a
 * phase-1 exercise (per seed.ts) are wired. AMBIENT_AUDIO / DICTIONARY have
 * no model in the phase-1 schema; SelectorService.draw() rejects those with
 * a 501-style error. STRUCTURE_TEMPLATE has a model (StructureTemplate) and
 * is wired here so story-structure exercises can draw a template.
 */
const DELEGATE_BY_BANK: Partial<Record<BankType, keyof PrismaClient>> = {
  CHARACTER: 'character',
  PLACE: 'place',
  OPENING_LINE: 'openingLine',
  STYLE_PARAGRAPH: 'styleParagraph',
  REFERENCE_STORY: 'referenceStory',
  NEWS: 'newsItem',
  IMAGE: 'imageAsset',
  OBJECT: 'objectItem',
  EMOTION: 'emotionLexicon',
  WHAT_IF: 'whatIfQuestion',
  STRUCTURE_PHRASE: 'structurePhrase',
  WORD: 'word',
  CUTUP_TEXT: 'cutupText',
  STRUCTURE_TEMPLATE: 'structureTemplate',
};

export function delegateFor(bankType: BankType) {
  const key = DELEGATE_BY_BANK[bankType];
  if (!key) {
    throw new Error(`Bank model not wired for ${bankType}`);
  }
  return key;
}

/**
 * Fetch the full item row for a (bankType, id) pair.
 * Typed via generics so the caller gets the concrete row type back.
 */
export async function fetchItem<T extends BankItem>(
  prisma: PrismaClient,
  bankType: BankType,
  id: string,
): Promise<T> {
  const key = delegateFor(bankType);
  const row = (prisma[key] as unknown as {
    findUnique: (args: { where: { id: string } }) => Promise<BankItem | null>;
  }).findUnique({ where: { id } });
  const found = await row;
  if (!found) throw new Error(`Bank item not found: ${bankType}/${id}`);
  return found as T;
}

/**
 * Build a Prisma where-input for "is this bank item usable right now?"
 * - CHARACTER / PLACE / OPENING_LINE / STYLE_PARAGRAPH / REFERENCE_STORY /
 *   IMAGE / OBJECT / EMOTION / WHAT_IF / STRUCTURE_PHRASE / WORD / CUTUP_TEXT:
 *   `isActive: true` and (where the column exists) `approvalStatus: APPROVED`.
 * - NEWS: uses `status: APPROVED` and `isSensitive: false` (per schema).
 *
 * DECISION: kept as a plain object cast to Prisma.WhereInput so each model's
 * column set is respected without a per-model generic switch here.
 */
export function usableWhere(bankType: BankType): Record<string, unknown> {
  if (bankType === 'NEWS') {
    return { status: 'APPROVED', isSensitive: false };
  }
  // DECISION: Word model has no approvalStatus column (it is a lexical
  // resource, not a curated bank item).
  if (bankType === 'WORD') {
    return { isActive: true };
  }
  // DECISION: StructureTemplate is a curated template with isActive but no
  // approvalStatus column (same shape as Word).
  if (bankType === 'STRUCTURE_TEMPLATE') {
    return { isActive: true };
  }
  return { isActive: true, approvalStatus: 'APPROVED' };
}

/**
 * List all usable item ids for a bank (used to seed a new UserCycle).
 */
export async function listUsableIds(
  prisma: PrismaClient,
  bankType: BankType,
): Promise<string[]> {
  const key = delegateFor(bankType);
  const delegate = prisma[key] as unknown as {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { id: true };
      orderBy: { id: 'asc' };
    }) => Promise<{ id: string }[]>;
  };
  // DECISION: orderBy id (not createdAt) because not every bank model has a
  // createdAt column (e.g. OpeningLine, EmotionLexicon, Word). UUIDs are
  // deterministic enough to give a stable, reproducible cycle order.
  const rows = await delegate.findMany({
    where: usableWhere(bankType),
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => r.id);
}
