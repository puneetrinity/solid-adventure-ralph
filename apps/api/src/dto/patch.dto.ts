import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatchResponseDto {
  @ApiProperty({ example: 'patch_abc123' })
  id!: string;

  @ApiProperty({ example: 'ps_abc123' })
  patchSetId!: string;

  @ApiProperty({ example: 'wf_abc123' })
  workflowId!: string;

  @ApiProperty({ example: 'Add dark mode toggle' })
  title!: string;

  @ApiProperty({ example: 'Adds a toggle button to switch between light and dark themes' })
  summary!: string;

  @ApiPropertyOptional({ example: 'task_abc123' })
  taskId?: string;

  @ApiProperty({
    example: 'low',
    enum: ['low', 'medium', 'high'],
  })
  riskLevel!: string;

  @ApiProperty({ example: true })
  addsTests!: boolean;

  @ApiProperty({
    example: ['src/components/ThemeToggle.tsx', 'src/styles/theme.css'],
    type: [String],
  })
  files!: string[];

  @ApiProperty({
    example: ['npm run test', 'npm run build'],
    type: [String],
  })
  proposedCommands!: string[];

  @ApiProperty({
    example: '--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1,3 +1,4 @@\n+import { ThemeProvider } from "./theme"',
  })
  diff!: string;

  @ApiProperty({ example: '2026-02-07T10:00:00.000Z' })
  createdAt!: string;
}
