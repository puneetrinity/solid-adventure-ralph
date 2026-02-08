import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '12345678' })
  id!: string;

  @ApiProperty({ example: 'octocat' })
  username!: string;

  @ApiPropertyOptional({ example: 'The Octocat' })
  name?: string;

  @ApiProperty({ example: 'https://github.com/images/octocat.png' })
  avatarUrl!: string;
}

export class AuthCallbackResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  token?: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
