import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * Client-reported practice stats (spec D.4 clientStats). All values are
 * self-reported; the server re-derives wordCount from contentText as the
 * source of truth and treats client stats as auxiliary signals for Integrity
 * (step 8).
 *
 * DECISION: kept as a plain optional object. The global ValidationPipe in this
 * project uses @nestjs/common's built-in pipe (implicit conversion, no
 * @nestjs/class-transformer), so nested class-transformer @Type() wiring is
 * not part of the flow. We validate the shape is an object and let Integrity
 * (step 8) interpret individual fields defensively.
 */
export class ClientStatsDto {
  wordCount?: number;
  durationSeconds?: number;
  pasteEvents?: number;
  pasteCharCount?: number;
  totalKeystrokes?: number;
  activeTimeSeconds?: number;
  pauses?: { start: number; duration: number }[];
  deletionCount?: number;
}

export class SubmitSessionDto {
  @IsString()
  @MinLength(0)
  @MaxLength(400000)
  contentText: string;

  @IsOptional()
  @IsObject()
  clientStats?: ClientStatsDto;
}
