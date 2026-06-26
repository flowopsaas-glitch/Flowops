import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AskDto {
  @ApiProperty({ example: 'How many deliveries failed this week?' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  question: string;
}
