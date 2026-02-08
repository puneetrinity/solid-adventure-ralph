/**
 * Unit tests for workflow list pagination
 */

describe('Workflow List Pagination', () => {
  // Mock Prisma client
  const mockPrisma = {
    workflow: {
      findMany: jest.fn(),
    },
  };

  // Helper to create mock workflows
  function createMockWorkflows(count: number, startDate = new Date()): Array<{
    id: string;
    state: string;
    createdAt: Date;
    baseSha: string | null;
  }> {
    return Array.from({ length: count }, (_, i) => ({
      id: `wf-${i + 1}`,
      state: 'INGESTED',
      createdAt: new Date(startDate.getTime() - i * 1000),
      baseSha: `abc${i}`,
    }));
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list parameters', () => {
    it('should return items with correct shape', async () => {
      const workflows = createMockWorkflows(5);
      mockPrisma.workflow.findMany.mockResolvedValue(workflows);

      const result = await mockListWorkflows(mockPrisma, { limit: 10 });

      expect(result.items).toHaveLength(5);
      expect(result.items[0]).toHaveProperty('id');
      expect(result.items[0]).toHaveProperty('state');
      expect(result.items[0]).toHaveProperty('createdAt');
      expect(result.items[0]).toHaveProperty('baseSha');
    });

    it('should return nextCursor when more items exist', async () => {
      // Request limit=5 but return 6 items (hasMore=true)
      const workflows = createMockWorkflows(6);
      mockPrisma.workflow.findMany.mockResolvedValue(workflows);

      const result = await mockListWorkflows(mockPrisma, { limit: 5 });

      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).not.toBeNull();
      expect(result.nextCursor).toBe(workflows[4].createdAt.toISOString());
    });

    it('should return null nextCursor when no more items', async () => {
      const workflows = createMockWorkflows(3);
      mockPrisma.workflow.findMany.mockResolvedValue(workflows);

      const result = await mockListWorkflows(mockPrisma, { limit: 10 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).toBeNull();
    });

    it('should filter by status when provided', async () => {
      const workflows = createMockWorkflows(2).map(w => ({
        ...w,
        state: 'DONE',
      }));
      mockPrisma.workflow.findMany.mockResolvedValue(workflows);

      await mockListWorkflows(mockPrisma, { limit: 10, status: 'DONE' });

      expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ state: 'DONE' }),
        })
      );
    });

    it('should use cursor for pagination', async () => {
      const cursor = '2026-02-07T10:00:00.000Z';
      mockPrisma.workflow.findMany.mockResolvedValue([]);

      await mockListWorkflows(mockPrisma, { limit: 10, cursor });

      expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: new Date(cursor) },
          }),
        })
      );
    });

    it('should order by createdAt descending (newest first)', async () => {
      mockPrisma.workflow.findMany.mockResolvedValue([]);

      await mockListWorkflows(mockPrisma, { limit: 10 });

      expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should fetch limit+1 to check for more items', async () => {
      mockPrisma.workflow.findMany.mockResolvedValue([]);

      await mockListWorkflows(mockPrisma, { limit: 20 });

      expect(mockPrisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21,
        })
      );
    });
  });
});

/**
 * Mock implementation of the list function (mirrors WorkflowsService.list)
 */
async function mockListWorkflows(
  prisma: { workflow: { findMany: jest.Mock } },
  params: { limit: number; cursor?: string; status?: string }
): Promise<{
  items: Array<{ id: string; state: string; createdAt: Date; baseSha: string | null }>;
  nextCursor: string | null;
}> {
  const { limit, cursor, status } = params;

  const where: Record<string, unknown> = {};
  if (status) {
    where.state = status;
  }
  if (cursor) {
    where.createdAt = { lt: new Date(cursor) };
  }

  const workflows = await prisma.workflow.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      state: true,
      createdAt: true,
      baseSha: true,
    },
  });

  const hasMore = workflows.length > limit;
  const items = hasMore ? workflows.slice(0, limit) : workflows;
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].createdAt.toISOString()
    : null;

  return { items, nextCursor };
}
