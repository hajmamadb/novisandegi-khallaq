import {
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LogEventDto {
  /** Event name, e.g. 'session_started' (spec D.7). */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  eventName: string;

  @IsOptional()
  @IsObject()
  eventPayloadJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sessionType?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  /** Client clock, for client/server drift analysis (spec EventLog.clientTimestamp). */
  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}
