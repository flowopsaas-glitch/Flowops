import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { RawString } from '../../common/decorators/raw-string.decorator';

/** Body of POST /ai/whatsapp-send-mock (a mock — nothing is sent). */
export class SendWhatsAppMockDto {
  /** E.164-style number: optional +, 7–15 digits. */
  @RawString()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'to must be a phone number of 7–15 digits, optionally starting with +' })
  to!: string;

  @RawString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;
}
