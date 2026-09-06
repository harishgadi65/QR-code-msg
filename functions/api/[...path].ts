// Vercel serverless entry point. Vercel treats every file under api/ as a function;
// this one catches every /api/** request and hands it to the same Express app used
// for local dev (src/localServer.ts) — Express request handlers are directly
// compatible with Vercel's Node function signature, no adapter needed.
import app from '../src/app'

export default app
