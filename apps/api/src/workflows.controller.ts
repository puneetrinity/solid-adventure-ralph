import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  async createWorkflow(@Body() body: { title?: string }) {
    return this.workflows.create(body?.title ?? 'Untitled workflow');
  }

  @Get(':id')
  async getWorkflow(@Param('id') id: string) {
    return this.workflows.get(id);
  }

  @Post(':id/actions/approve')
  async approve(@Param('id') id: string, @Body() body: { patchSetId?: string; approvedBy?: string }) {
    return this.workflows.approve(id, body?.patchSetId, body?.approvedBy ?? 'me');
  }
}
