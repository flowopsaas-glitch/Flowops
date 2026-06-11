import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { getCollections } from '../controllers/collection.controller';

const router = Router();

router.get('/', authenticateToken, getCollections);

export default router;
