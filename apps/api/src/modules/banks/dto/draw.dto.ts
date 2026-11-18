import { IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

/**
 * POST /banks/:bankType/draw — query/body are optional.
 * `sessionId` is included when the draw is requested from inside an active
 * practice session so the SelectionLog row can be linked back to it.
 *
 * Phase-2 field-level filters (CONDITIONAL banks only):
 *  - OPENING_LINE:  genre, mood, difficulty
 *  - NEWS:          category, maxAgeDays (freshness)
 *  - REFERENCE_STORY: genre
 * Unknown filters are silently ignored by the selector (defensive).
 */
export class DrawDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  exerciseSlug?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  mood?: string;

  @IsOptional()
  @IsInt()
  difficulty?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxAgeDays?: number;
}
