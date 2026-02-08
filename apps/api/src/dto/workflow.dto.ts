import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkflowDto {
  @ApiPropertyOptional({
    description: 'Title of the workflow',
    example: 'Add dark mode feature',
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'GitHub repository owner (user or org)',
    example: 'puneetrinity',
  })
  repoOwner?: string;

  @ApiPropertyOptional({
    description: 'GitHub repository name',
    example: 'arch-orchestrator-sandbox',
  })
  repoName?: string;

  @ApiPropertyOptional({
    description: 'Base branch to work from',
    example: 'main',
    default: 'main',
  })
  baseBranch?: string;
}

export class ApproveWorkflowDto {
  @ApiPropertyOptional({
    description: 'ID of the specific patch set to approve',
    example: 'ps_abc123',
  })
  patchSetId?: string;
}

export class RejectWorkflowDto {
  @ApiPropertyOptional({
    description: 'ID of the specific patch set to reject',
    example: 'ps_abc123',
  })
  patchSetId?: string;

  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Changes do not align with architecture guidelines',
  })
  reason!: string;
}

export class RequestChangesDto {
  @ApiPropertyOptional({
    description: 'ID of the specific patch set',
    example: 'ps_abc123',
  })
  patchSetId?: string;

  @ApiProperty({
    description: 'Comment describing requested changes',
    example: 'Please add unit tests for the new function',
  })
  comment!: string;
}

export class WorkflowResponseDto {
  @ApiProperty({ example: 'wf_abc123' })
  id!: string;

  @ApiProperty({ example: 'INGESTED' })
  state!: string;

  @ApiPropertyOptional({ example: 'Add dark mode feature' })
  title?: string;

  @ApiPropertyOptional({ example: 'puneetrinity' })
  repoOwner?: string;

  @ApiPropertyOptional({ example: 'arch-orchestrator-sandbox' })
  repoName?: string;

  @ApiProperty({ example: 'main' })
  baseBranch!: string;

  @ApiProperty({ example: '2026-02-07T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-02-07T10:05:00.000Z' })
  updatedAt?: string;

  @ApiPropertyOptional({ example: 'abc1234567890' })
  baseSha?: string;
}

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Maximum number of items to return',
    example: 20,
    default: 20,
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    example: 'eyJpZCI6IndmXzEyMyJ9',
  })
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter by workflow status',
    example: 'WAITING_USER_APPROVAL',
  })
  status?: string;
}

export class PaginatedWorkflowsResponseDto {
  @ApiProperty({ type: [WorkflowResponseDto] })
  data!: WorkflowResponseDto[];

  @ApiPropertyOptional({ example: 'eyJpZCI6IndmXzEyMyJ9' })
  nextCursor?: string;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}

export class ApprovalResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiPropertyOptional({ example: 'wf_abc123' })
  workflowId?: string;

  @ApiPropertyOptional({ example: 'ps_abc123' })
  patchSetId?: string;

  @ApiPropertyOptional({ example: 'No patch set found to approve' })
  error?: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 'NOT_FOUND' })
  errorCode!: string;

  @ApiProperty({ example: 'Workflow not found' })
  message!: string;
}
