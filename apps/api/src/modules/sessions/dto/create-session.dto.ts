import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { BankType } from '@prisma/client';

export class CreateSessionDto {
  @IsUUID()
  exerciseTypeId: string;

  // DECISION: sourceItem is resolved server-side by the Selector (step 7).
  // The client may echo the id/type it rendered, but phase 1 treats them as
  // optional informational fields — the authoritative draw happens in
  // createSession when bankSourceType != null.
  @IsOptional()
  @IsUUID()
  sourceItemId?: string;

  @IsOptional()
  @IsEnum(BankType)
  sourceItemType?: BankType;
}
