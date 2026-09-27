import express from 'express';
import cors from 'cors';
import spherexRouter from '../../backend/spherex-api.cjs';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/spherex', spherexRouter);

export const maxDuration = 60;
export default app;
