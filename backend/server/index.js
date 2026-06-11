import express from 'express';
import cors from 'cors';
import clawRoutes from './routes/claw.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Plug in the Claw Executive Agent route
app.use('/api/ai/claw-chat', clawRoutes);

app.listen(PORT, () => {
  console.log(`[SYS] FlowOps Backend active on port ${PORT}`);
  console.log(`[SYS] Operational_Claw_v1.0 logic initialized.`);
});
