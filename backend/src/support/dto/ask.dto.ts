import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AskSupportDto {
  @IsString()
  @MaxLength(2000)
  message!: string;

  /** Prior turns for multi-turn context (most-recent last). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}
