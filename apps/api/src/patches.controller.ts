import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { getPrisma } from '@db';
import { PatchResponseDto, ErrorResponseDto } from './dto';

@ApiTags('patches')
@Controller('patches')
export class PatchesController {
  private prisma = getPrisma();

  @Get(':id')
  @ApiOperation({ summary: 'Get patch', description: 'Get a patch by ID with diff content' })
  @ApiParam({ name: 'id', description: 'Patch ID' })
  @ApiResponse({ status: 200, description: 'Patch details', type: PatchResponseDto })
  @ApiResponse({ status: 404, description: 'Patch not found', type: ErrorResponseDto })
  async getPatch(@Param('id') id: string) {
    const patch = await this.prisma.patch.findUnique({
      where: { id },
      include: { patchSet: true }
    });

    if (!patch) return null;

    return {
      id: patch.id,
      patchSetId: patch.patchSetId,
      workflowId: patch.patchSet.workflowId,
      title: patch.title,
      summary: patch.summary,
      taskId: patch.taskId,
      riskLevel: patch.riskLevel,
      addsTests: patch.addsTests,
      files: patch.files,
      proposedCommands: patch.proposedCommands,
      diff: patch.diff,
      createdAt: patch.createdAt
    };
  }
}
