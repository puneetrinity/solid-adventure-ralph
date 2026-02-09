import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiCookieAuth } from '@nestjs/swagger';
import { ReposService } from './repos.service';
import { AuthGuard } from './auth.guard';
import { ErrorResponseDto } from './dto';

@ApiTags('repos')
@Controller('repos')
export class ReposController {
  constructor(private readonly repos: ReposService) {}

  @Get('context')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get repo context', description: 'Get stored context for a repository' })
  @ApiQuery({ name: 'owner', required: true, description: 'Repository owner' })
  @ApiQuery({ name: 'repo', required: true, description: 'Repository name' })
  @ApiQuery({ name: 'branch', required: false, description: 'Base branch (default: main)' })
  @ApiResponse({ status: 200, description: 'Context status and data' })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  async getContext(
    @Query('owner') owner: string,
    @Query('repo') repo: string,
    @Query('branch') branch?: string
  ) {
    return this.repos.getContext(owner, repo, branch || 'main');
  }

  @Post('context/refresh')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Refresh repo context', description: 'Enqueue a job to refresh repository context' })
  @ApiQuery({ name: 'owner', required: true, description: 'Repository owner' })
  @ApiQuery({ name: 'repo', required: true, description: 'Repository name' })
  @ApiQuery({ name: 'branch', required: false, description: 'Base branch (default: main)' })
  @ApiResponse({ status: 200, description: 'Refresh job enqueued' })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  async refreshContext(
    @Query('owner') owner: string,
    @Query('repo') repo: string,
    @Query('branch') branch?: string
  ) {
    return this.repos.refreshContext(owner, repo, branch || 'main');
  }

  @Get('contexts')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List repo contexts', description: 'List all stored repository contexts' })
  @ApiQuery({ name: 'owner', required: false, description: 'Filter by repository owner' })
  @ApiResponse({ status: 200, description: 'List of contexts' })
  @ApiResponse({ status: 401, description: 'Not authenticated', type: ErrorResponseDto })
  async listContexts(@Query('owner') owner?: string) {
    return this.repos.listContexts(owner);
  }
}
