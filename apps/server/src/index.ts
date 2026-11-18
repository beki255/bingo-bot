import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createApp } from "./app.js";
import { botService } from "./bot/botService.js";
import { gameRoundService } from "./services/gameRoundService.js";

async function main() {
  await prisma.$connect();

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
  });

  botService.attachIO(io);
  gameRoundService.attachIO(io);
  await botService.start();

  httpServer.listen(env.port, () => {
    console.log(`Bingo server listening on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    await botService.stop();
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Server fatal error:", err);
  process.exit(1);
});

