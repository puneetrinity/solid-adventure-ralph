import { Body, Controller, Get, Param, Post, Query, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiCookieAuth } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  CreateWorkflowDto,
  ApproveWorkflowDto,
  RejectWorkflowDto,
  RequestChangesDto,
  WorkflowResponseDto,
  PaginatedWorkflowsResponseDto,
  ApprovalResponseDto,
  ErrorResponseDto,
} from './dto';

@ApiTags('workflows')
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @ApiOperation({ summary: 'List workflows', description: 'Get a paginated list of workflows' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max items to return (1-100)', example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Pagination cursor' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status', example: 'WAITING_USER_APPROVAL' })
  @ApiResponse({ status: 200, description: 'List of workflows', type: PaginatedWorkflowsResponseDto })
  async listWorkflows(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const safeLimit = Math.min(Math.max(1, parsedLimit || 20), 100);
    return this.workflows.list({ limit: safeLimit, cursor, status });
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create workflow', description: 'Create a new workflow' })
  @ApiResponse({ status: 201, description: 'Workflow created', type: WorkflowResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  async createWorkflow(@Body() body: CreateWorkflowDto) {
    try {
      return await this.workflows.create({
        title: body?.title,
        repoOwner: body?.repoOwner,
        repoName: body?.repoName,
        baseBranch: body?.baseBranch,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'BadRequestException') {
        throw new HttpException(
          { errorCode: 'VALIDATION_ERROR', message: err.message },
          HttpStatus.BAD_REQUEST
        );
      }
      throw err;
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow', description: 'Get a workflow by ID with all related data' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 200, description: 'Workflow details', type: WorkflowResponseDto })
  @ApiResponse({ status: 404, description: 'Workflow not found', type: ErrorResponseDto })
  async getWorkflow(@Param('id') id: string) {
    return this.workflows.get(id);
  }

  @Post(':id/actions/approve')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Approve workflow', description: 'Approve a workflow patch set' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 200, description: 'Approval successful', type: ApprovalResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Workflow not found', type: ErrorResponseDto })
  async approve(
    @Param('id') id: string,
    @Body() body: ApproveWorkflowDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.workflows.approve(id, body?.patchSetId, req.user.username);
  }

  @Post(':id/actions/request_changes')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Request changes', description: 'Request changes to a workflow patch set' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 200, description: 'Changes requested', type: ApprovalResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Workflow not found', type: ErrorResponseDto })
  async requestChanges(
    @Param('id') id: string,
    @Body() body: RequestChangesDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.workflows.requestChanges(id, body?.patchSetId, body.comment, req.user.username);
  }

  @Post(':id/actions/reject')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Reject workflow', description: 'Reject a workflow patch set' })
  @ApiParam({ name: 'id', description: 'Workflow ID' })
  @ApiResponse({ status: 200, description: 'Rejection successful', type: ApprovalResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Workflow not found', type: ErrorResponseDto })
  async reject(
    @Param('id') id: string,
    @Body() body: RejectWorkflowDto,
    @Req() req: AuthenticatedRequest
  ) {
    return this.workflows.reject(id, body?.patchSetId, body.reason, req.user.username);
  }
}
