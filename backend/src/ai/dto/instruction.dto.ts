import { IsNotEmpty, IsString } from 'class-validator';

export class InstructionDto {
  @IsString()
  @IsNotEmpty()
  instruction: string;
}
