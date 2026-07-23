import { Router } from 'express';
import { getReleaseMetadata } from '../../application/release/ReleaseMetadata';

const router=Router();
router.get('/release',(_req,res)=>res.json({release:getReleaseMetadata()}));
export default router;
