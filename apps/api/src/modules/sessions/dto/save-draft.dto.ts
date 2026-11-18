import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { DraftSaveTrigger } from '@prisma/client';

export class SaveDraftDto {
  @IsString()
  @MinLength(0)
  @MaxLength(200000)
  contentText: string;

  // DECISION: the client decides AUTO (periodic) vs MANUAL (explicit save).
  // SUBMIT trigger is used server-side at submit time, not by the client.
  @IsOptional()
  @IsEnum(DraftSaveTrigger)
  saveTrigger?: DraftSaveTrigger;
}
