import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// DECISION: spec D.1 — email valid ≤255, password ≥8 with ≥1 letter and ≥1
// number, displayName 2–100. The regex enforces both a letter and a number.
export class RegisterDto {
  @IsEmail({}, { message: 'VALIDATION_ERROR: email must be a valid address' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8, { message: 'VALIDATION_ERROR: password must be ≥8 chars' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message:
      'VALIDATION_ERROR: password must contain at least one letter and one number',
  })
  password: string;

  @IsString()
  @MinLength(2, { message: 'VALIDATION_ERROR: displayName must be ≥2 chars' })
  @MaxLength(100, { message: 'VALIDATION_ERROR: displayName must be ≤100 chars' })
  displayName: string;
}
