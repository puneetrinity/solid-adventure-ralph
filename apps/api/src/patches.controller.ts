import { Controller, Get, Param } from '@nestjs/common';
import { getPrisma } from '@db';

@Controller('patches')
export class PatchesController {
  private prisma = getPrisma();

  @Get(':id')
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
