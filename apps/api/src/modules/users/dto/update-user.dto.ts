import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsObject()
  settingsJson?: Record<string, unknown>;
}
