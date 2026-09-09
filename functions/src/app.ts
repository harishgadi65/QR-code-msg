import express from 'express'
import cors from 'cors'
import { attachUser, requireAdmin, type AuthedRequest } from './middleware/auth'
import customerQrRouter from './routes/customerQr'
import mediaRouter from './routes/media'
import adminQrRouter from './routes/adminQr'
import adminBatchesRouter from './routes/adminBatches'
import adminStatsRouter from './routes/adminStats'
import adminTestRouter from './routes/adminTest'

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())
app.use(attachUser)

// Vercel forwards the full original request path unchanged to this function, so
// routes are mounted under /api to match — not stripped down to /qr, /admin, etc.
app.use('/api/qr', customerQrRouter)
app.use('/api/media', mediaRouter)

const adminRouter = express.Router()
adminRouter.use(requireAdmin as express.RequestHandler)
adminRouter.use('/qr', adminQrRouter)
adminRouter.use('/batches', adminBatchesRouter)
adminRouter.use('/stats', adminStatsRouter)
adminRouter.use('/test', adminTestRouter)
app.use('/api/admin', adminRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' })
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: AuthedRequest, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' })
})

export default app
