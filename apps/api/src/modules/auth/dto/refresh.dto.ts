import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(20, { message: 'VALIDATION_ERROR: accessToken looks malformed' })
  accessToken: string;
}
