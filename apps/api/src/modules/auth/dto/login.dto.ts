import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'VALIDATION_ERROR: email must be a valid address' })
  @MaxLength(255)
  email: string;

  // DECISION: login only checks length — the letter+number rule is a
  // registration concern. Rejecting here would break logins for accounts
  // created before the rule tightened.
  @IsString()
  @MinLength(8, { message: 'VALIDATION_ERROR: password must be ≥8 chars' })
  password: string;
}
