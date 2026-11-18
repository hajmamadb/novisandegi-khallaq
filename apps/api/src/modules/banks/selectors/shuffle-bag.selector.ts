// Spec E.3 file layout: the shuffle-bag strategy lives in its own file.
// The implementation is in `selector.service.ts` (single module, easy to
// unit-test the `ShuffleBagSelector` export directly). Re-exported here so
// the file layout in the spec tree is honored.
export { ShuffleBagSelector } from './selector.service';
