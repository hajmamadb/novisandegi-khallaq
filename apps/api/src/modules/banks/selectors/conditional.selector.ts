// Spec E.3 file layout: conditional strategy.
// Phase 2: extends WeightedSelector with field-level filters
// (genre/mood/difficulty for OPENING_LINE, category/freshness for NEWS,
// genre for REFERENCE_STORY). Algorithm: WEIGHTED_RANDOM (Efraimidis-Spirakis).
export { ConditionalSelector } from './selector.service';
