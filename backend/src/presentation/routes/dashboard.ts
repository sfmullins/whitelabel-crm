import { Router } from 'express';
import { WorkspaceService } from '../../application/services/WorkspaceService';
import { WorkspaceRepository } from '../../infrastructure/database/WorkspaceRepository';

const router = Router();
const service = new WorkspaceService(new WorkspaceRepository());

router.get('/metrics', async (_req, res, next) => {
  try {
    res.json(await service.getDashboard());
  } catch (error) {
    next(error);
  }
});

export default router;
