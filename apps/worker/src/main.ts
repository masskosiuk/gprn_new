import "dotenv/config";

import { loadRuntimeEnv } from "@gprn/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

import { queueNames } from "./queues.js";

const env = loadRuntimeEnv();
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

for (const queueName of queueNames) {
  const worker = new Worker(
    queueName,
    async (job) => {
      console.info({
        jobId: job.id,
        name: job.name,
        queueName
      });
    },
    { connection }
  );

  worker.on("failed", (job, error) => {
    console.error({
      error,
      jobId: job?.id,
      queueName
    });
  });
}
