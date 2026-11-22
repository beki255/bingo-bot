import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "../db/prisma.js";
import {
  toCents,
  centsToNumber,
  centsToDecimal,
  deductBetTx,
  creditWinTx,
} from "./walletService.js";
import { realtimeService } from "./realtimeService.js";
import { generateDeterministicCartela, type BingoLetter } from "@bingo/shared";

export function getLetterForNumber(n: number): BingoLetter {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}

export function checkCartelaWin(
  grid: number[][],
  calledNumbersSet: Set<number>,
  freeCenter: boolean = true
): { hasWon: boolean; winningKeys: Set<string> } {
  const isMarked = (r: number, c: number) => {
    if (freeCenter && r === 2 && c === 2) return true; // Center free star if enabled
    return calledNumbersSet.has(grid[r][c]);
  };

  // 1. Horizontal row
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => isMarked(r, c))) {
      return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((c) => `${r}-${c}`)) };
    }
  }

  // 2. Vertical column
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => isMarked(r, c))) {
      return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((r) => `${r}-${c}`)) };
    }
  }

  // 3. Diagonal 1 (\)
  if ([0, 1, 2, 3, 4].every((i) => isMarked(i, i))) {
    return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((i) => `${i}-${i}`)) };
  }

  // 4. Diagonal 2 (/)
  if ([0, 1, 2, 3, 4].every((i) => isMarked(i, 4 - i))) {
    return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((i) => `${i}-${4 - i}`)) };
  }

  // 5. Four Corners
  if (isMarked(0, 0) && isMarked(0, 4) && isMarked(4, 0) && isMarked(4, 4)) {
    return { hasWon: true, winningKeys: new Set(["0-0", "0-4", "4-0", "4-4"]) };
  }

  return { hasWon: false, winningKeys: new Set() };
}

export interface WinnerResult {
  winners: Array<{
    name: string;
    avatar: string;
    cardNo: number;
    telegramId?: string;
    userId?: string;
  }>;
  winningCartelaNo: number;
  winningPatternKeys: string[];
  derash?: number;
  delaySeconds?: number;
}

export class GameRoundService {
  private io: SocketIOServer | null = null;
  private callTimers: Map<string, NodeJS.Timeout> = new Map();
  private countdownTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingSelections: Map<string, Map<string, number[]>> = new Map();
  private roomNextGameAvailableAt: Map<string, number> = new Map();
  private deferredCountdownTimers: Map<string, NodeJS.Timeout> = new Map();

  attachIO(io: SocketIOServer) {
    this.io = io;
    this.setupSocketEvents();
  }

  getPendingSelections(roomId: string, excludeClientId?: string): number[] {
    const roomMap = this.pendingSelections.get(roomId);
    if (!roomMap) return [];
    const list: number[] = [];
    for (const [cId, cards] of roomMap.entries()) {
      if (excludeClientId && cId === excludeClientId) continue;
      list.push(...cards);
    }
    return Array.from(new Set(list));
  }

  async setClientSelection(roomId: string, clientId: string, cards: number[]) {
    if (!this.pendingSelections.has(roomId)) {
      this.pendingSelections.set(roomId, new Map());
    }
    const roomMap = this.pendingSelections.get(roomId)!;
    if (!cards || cards.length === 0) {
      roomMap.delete(clientId);
    } else {
      roomMap.set(clientId, cards);
    }
    if (this.io) {
      this.io.to(`room_${roomId}`).emit("room_selections", {
        roomId,
        pendingSelections: this.getPendingSelections(roomId),
      });
      this.io.to("admin_monitor").emit("admin_room_selections", {
        roomId,
        pendingSelections: this.getPendingSelections(roomId),
      });
    }

    // Automatically start countdown when total active/selected cards in the room meet minPlayers
    try {
      const round = await this.getOrCreateActiveRound(roomId);
      const totalSelected = this.getPendingSelections(roomId).length;
      const totalActive = (round.tickets?.length || 0) + totalSelected;
      const minRequired = round.room?.minPlayers || 2;
      if (totalActive >= minRequired && round.status === "WAITING") {
        await this.startCountdown(roomId, round.id);
      }
    } catch {}
  }

  removeClient(roomId: string, clientId: string) {
    const roomMap = this.pendingSelections.get(roomId);
    if (roomMap) {
      roomMap.delete(clientId);
      if (this.io) {
        this.io.to(`room_${roomId}`).emit("room_selections", {
          roomId,
          pendingSelections: this.getPendingSelections(roomId),
        });
        this.io.to("admin_monitor").emit("admin_room_selections", {
          roomId,
          pendingSelections: this.getPendingSelections(roomId),
        });
      }
    }
  }

  private setupSocketEvents() {
    if (!this.io) return;
    this.io.on("connection", (socket) => {
      let currentRoom: string | null = null;
      let currentClient: string = socket.id;

      socket.on("join_user", (data: { telegramId: string | number }) => {
        if (data?.telegramId) {
          socket.join(`user_${String(data.telegramId)}`);
        }
      });

      socket.on("join_admin_monitor", async () => {
        socket.join("admin_monitor");
        try {
          const rooms = await prisma.room.findMany({ where: { isActive: true } });
          for (const room of rooms) {
            const state = await this.getRoomState(room.id);
            socket.emit("admin_room_state", { roomId: room.id, state });
          }
        } catch {}
      });

      socket.on("join_room", async (data: any) => {
        const roomId = typeof data === "string" ? data : data?.roomId;
        if (!roomId) return;
        const clientId = typeof data === "object" && data?.clientId ? data.clientId : socket.id;
        const telegramId = typeof data === "object" && data?.telegramId ? data.telegramId : clientId;
        if (telegramId) {
          socket.join(`user_${String(telegramId)}`);
        }
        currentRoom = roomId;
        currentClient = clientId;
        socket.join(`room_${roomId}`);

        const state = await this.getRoomState(roomId);
        socket.emit("room_state", state);
        socket.emit("room_selections", {
          roomId,
          pendingSelections: this.getPendingSelections(roomId),
        });
      });

      socket.on("select_cards", (data: { roomId: string; clientId: string; cards: number[] }) => {
        if (!data?.roomId) return;
        this.setClientSelection(data.roomId, data.clientId || currentClient, data.cards || []);
      });

      socket.on("claim_bingo", async (data: { roomId: string; cartelaNo: number }) => {
        if (!data?.roomId || !data?.cartelaNo) return;
        const round = await prisma.gameRound.findFirst({
          where: { roomId: data.roomId, status: "RUNNING" },
          include: {
            room: true,
            tickets: {
              include: {
                user: { select: { id: true, firstName: true, username: true, telegramId: true } },
              },
            },
          },
        });
        if (!round) return;
        const targetTicket = round.tickets.find((t) => t.cartelaNumber === data.cartelaNo);
        if (!targetTicket) return;
        const grid = generateDeterministicCartela(data.cartelaNo);
        const win = checkCartelaWin(grid, new Set(round.calledNumbers), round.room?.freeCenter ?? true);
        if (win.hasWon) {
          const callTimer = this.callTimers.get(data.roomId);
          if (callTimer) {
            clearInterval(callTimer);
            this.callTimers.delete(data.roomId);
          }
          await this.handleWinner(data.roomId, round.id, [{ ticket: targetTicket, keys: win.winningKeys }]);
        }
      });

      socket.on("disconnect", () => {
        if (currentRoom) {
          this.removeClient(currentRoom, currentClient);
        }
      });
    });
  }

  private broadcastRoomState(roomId: string, state: any) {
    if (!this.io) return;
    this.io.to(`room_${roomId}`).emit("room_state", state);
    this.io.to("admin_monitor").emit("admin_room_state", { roomId, state });
  }

  private emitEvent(roomId: string, event: string, payload: any) {
    if (!this.io) return;
    this.io.to(`room_${roomId}`).emit(event, payload);
    this.io.to("admin_monitor").emit("admin_game_event", { roomId, event, payload });
  }

  /**
   * Retrieves active round or creates a new WAITING round for the given room
   */
  async getOrCreateActiveRound(roomId: string) {
    const activeRounds = await prisma.gameRound.findMany({
      where: {
        roomId,
        status: { in: ["WAITING", "COUNTDOWN", "RUNNING"] },
      },
      include: {
        tickets: {
          include: {
            user: { select: { id: true, firstName: true, username: true } },
          },
        },
        room: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let round: (typeof activeRounds)[number] | null = activeRounds[0] || null;

    // Clean up any stale duplicate empty WAITING rounds for this room
    if (activeRounds.length > 1) {
      const extraEmpty = activeRounds.slice(1).filter((r) => r.status === "WAITING" && r.tickets.length === 0);
      if (extraEmpty.length > 0) {
        await prisma.gameRound.deleteMany({
          where: { id: { in: extraEmpty.map((r) => r.id) } },
        }).catch(() => {});
      }
    }

    if (round && round.status === "RUNNING") {
      const isExpired = round.startedAt && Date.now() - round.startedAt.getTime() > 600000;
      const isAllBallsCalled = round.calledNumbers.length >= 75;
      const hasNoTickets = round.tickets.length === 0;

      if (isAllBallsCalled || isExpired || hasNoTickets) {
        const timer = this.callTimers.get(roomId);
        if (timer) clearInterval(timer);
        this.callTimers.delete(roomId);

        await prisma.gameRound.update({
          where: { id: round.id },
          data: { status: "FINISHED", endedAt: new Date() },
        });
        round = null;
      } else if (!this.callTimers.has(roomId)) {
        this.startBallCallingTimer(roomId, round.id, round.room?.callIntervalMs || 3500);
      }
    }

    if (round && round.status === "COUNTDOWN") {
      const isCountdownAlive = this.countdownTimers.has(roomId);
      const isExpired = round.countdownEndsAt && round.countdownEndsAt.getTime() < Date.now() - 30000;
      if (!isCountdownAlive && isExpired) {
        await prisma.gameRound.update({
          where: { id: round.id },
          data: { status: "WAITING", countdownEndsAt: null },
        });
        round.status = "WAITING";
        round.countdownEndsAt = null;
      }
    }

    if (!round) {
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) throw new Error("ROOM_NOT_FOUND");

      round = await prisma.gameRound.create({
        data: {
          roomId,
          status: "WAITING",
          calledNumbers: [],
          shuffledDeck: [],
          totalPot: 0,
          houseCutAmount: 0,
          prizePool: 0,
        },
        include: {
          tickets: {
            include: {
              user: { select: { id: true, firstName: true, username: true, telegramId: true } },
            },
          },
          room: true,
        },
      });
    }

    return round;
  }

  /**
   * Returns clean room state for clients (Mini App)
   */
  async getRoomState(roomId: string) {
    const round = await this.getOrCreateActiveRound(roomId);
    const stake = Number(round.room.stakeAmount);
    const houseCutPct = Number(round.room.houseCutPercent ?? 20) / 100;
    const minPlayers = round.room.minPlayers ?? 2;
    const takenCards = round.tickets.map((t) => t.cartelaNumber);
    const uniqueUserIds = new Set(round.tickets.map((t) => t.userId));
    const playersCount = uniqueUserIds.size;
    const ticketsCount = round.tickets.length;

    // Real derash = total bets minus room house commission cut %
    const totalPot = ticketsCount * stake;
    const derash = Math.floor(totalPot * (1 - houseCutPct));

    let remainingCountdown = 0;
    if (round.status === "COUNTDOWN" && round.countdownEndsAt) {
      const diffMs = round.countdownEndsAt.getTime() - Date.now();
      remainingCountdown = Math.max(0, Math.ceil(diffMs / 1000));
    }

    const currentBallNum = round.calledNumbers.length > 0 ? round.calledNumbers[round.calledNumbers.length - 1] : null;
    const currentBall = currentBallNum
      ? { letter: getLetterForNumber(currentBallNum), num: currentBallNum }
      : null;

    const recentCalls = round.calledNumbers
      .slice(-3)
      .reverse()
      .map((num) => ({
        num,
        letter: getLetterForNumber(num),
      }));

    const gameCode = "TB" + (round.id.length > 6 ? round.id.slice(-6).toUpperCase() : round.id.toUpperCase());

    const cooldownEndsAt = this.roomNextGameAvailableAt.get(roomId) || 0;
    const postGameDelayRemaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));

    return {
      roomId,
      roundId: round.id,
      gameId: gameCode,
      gameCode,
      status: round.status,
      postGameDelayRemaining,
      isPostGameDelay: postGameDelayRemaining > 0,
      stake,
      minPlayers,
      playersCount,
      ticketsCount,
      derash,
      takenCards,
      pendingSelections: this.getPendingSelections(roomId),
      countdown: remainingCountdown,
      calledNumbers: round.calledNumbers,
      currentBall,
      recentCalls,
      countdownSeconds: round.room.countdownSeconds ?? 30,
      nextGameDelaySeconds: round.room.nextGameDelaySeconds ?? 6,
      callIntervalMs: round.room.callIntervalMs ?? 3500,
      cartelaPoolSize: round.room.cartelaPoolSize ?? 600,
      freeCenter: round.room.freeCenter ?? true,
      maxCartelasPerUser: round.room.maxCartelasPerUser ?? 2,
      winningPattern: round.room.winningPattern,
    };
  }

  /**
   * Buy tickets using real wallet balance
   */
  async buyTickets(input: {
    roomId: string;
    telegramId: bigint;
    cartelaNumbers: number[];
  }) {
    const { roomId, telegramId, cartelaNumbers } = input;
    if (!cartelaNumbers || cartelaNumbers.length === 0) {
      throw new Error("NO_CARDS_SELECTED");
    }

    let user = await prisma.user.findUnique({
      where: { telegramId },
      include: { wallet: true },
    });
    if (!user) {
      const { findOrCreateTelegramUser } = await import("./userService.js");
      user = await findOrCreateTelegramUser({ telegramId, firstName: "Player " + String(telegramId).slice(-4) });
    }
    if (!user) throw new Error("USER_NOT_FOUND");

    const round = await this.getOrCreateActiveRound(roomId);
    if (round.status === "RUNNING" || round.status === "FINISHED") {
      throw new Error("ROUND_ALREADY_STARTED");
    }

    const stakeAmount = Number(round.room.stakeAmount);
    const totalCost = cartelaNumbers.length * stakeAmount;

    // 1. Check if any card is already taken in this round
    const existingTickets = await prisma.gameTicket.findMany({
      where: {
        gameRoundId: round.id,
        cartelaNumber: { in: cartelaNumbers },
      },
    });
    if (existingTickets.length > 0) {
      const takenList = existingTickets.map((t) => t.cartelaNumber).join(", ");
      throw new Error(`CARDS_ALREADY_TAKEN: ${takenList}`);
    }

    // 2. Transact: deduct balance & create tickets
    let balanceAfterDeduct = 0;
    await prisma.$transaction(async (tx) => {
      const balAfter = await deductBetTx(tx, user.id, totalCost, round.id);
      balanceAfterDeduct = Number(balAfter);

      for (const cardNum of cartelaNumbers) {
        await tx.gameTicket.create({
          data: {
            gameRoundId: round.id,
            userId: user.id,
            cartelaNumber: cardNum,
            pricePaid: centsToDecimal(toCents(stakeAmount)),
            status: "ACTIVE",
          },
        });
      }

      // Update round pots based on room's house cut %
      const newTotalTickets = round.tickets.length + cartelaNumbers.length;
      const newTotalPot = newTotalTickets * stakeAmount;
      const houseCutPct = Number(round.room.houseCutPercent ?? 20) / 100;
      const newHouseCut = newTotalPot * houseCutPct;
      const newPrizePool = newTotalPot - newHouseCut;

      await tx.gameRound.update({
        where: { id: round.id },
        data: {
          totalPot: centsToDecimal(toCents(newTotalPot)),
          houseCutAmount: centsToDecimal(toCents(newHouseCut)),
          prizePool: centsToDecimal(toCents(newPrizePool)),
        },
      });
    });

    realtimeService.notifyWalletUpdate(user.telegramId, {
      balance: balanceAfterDeduct,
      reason: "BET_DEDUCTED",
    });

    this.removeClient(roomId, String(telegramId));

    // 3. Check if threshold of minPlayers/cards is reached to start countdown
    const updatedRound = await prisma.gameRound.findUnique({
      where: { id: round.id },
      include: {
        tickets: {
          include: {
            user: { select: { id: true, firstName: true, phoneNumber: true } },
          },
        },
        room: true,
      },
    });

    const totalTicketsCount = updatedRound?.tickets.length || 0;
    const minRequired = updatedRound?.room.minPlayers || 2;

    this.emitEvent(roomId, "ticket_purchased", {
      roomId,
      roundId: round.id,
      cartelaNumbers,
      telegramId: String(telegramId),
      ticketsCount: totalTicketsCount,
      tickets: updatedRound?.tickets.map((t) => ({
        id: t.id,
        userName: t.user?.firstName || "Player",
        userPhone: t.user?.phoneNumber || null,
        cartelaNumber: t.cartelaNumber,
        status: t.status,
        pricePaid: Number(t.pricePaid),
        prizeWon: Number(t.prizeWon),
      })),
    });

    if (totalTicketsCount >= minRequired && updatedRound?.status === "WAITING") {
      await this.startCountdown(roomId, round.id);
    } else {
      const state = await this.getRoomState(roomId);
      this.broadcastRoomState(roomId, state);
    }

    return this.getRoomState(roomId);
  }

  /**
   * Starts the live countdown when >= minPlayers cards are registered
   */
  async startCountdown(roomId: string, roundId: string) {
    const cooldownEndsAt = this.roomNextGameAvailableAt.get(roomId) || 0;
    const now = Date.now();
    if (now < cooldownEndsAt) {
      const waitRemainingMs = cooldownEndsAt - now;
      if (!this.deferredCountdownTimers.has(roomId)) {
        const deferredTimer = setTimeout(async () => {
          this.deferredCountdownTimers.delete(roomId);
          try {
            const currentRound = await prisma.gameRound.findUnique({
              where: { id: roundId },
              include: { tickets: true, room: true },
            });
            if (currentRound && currentRound.status === "WAITING") {
              const totalSelected = this.getPendingSelections(roomId).length;
              const totalActive = (currentRound.tickets?.length || 0) + totalSelected;
              const minRequired = currentRound.room?.minPlayers || 2;
              if (totalActive >= minRequired) {
                await this.startCountdown(roomId, roundId);
              }
            }
          } catch (e) {
            console.error("[GameRound] Deferred countdown error:", e);
          }
        }, waitRemainingMs);
        this.deferredCountdownTimers.set(roomId, deferredTimer);
      }
      return;
    }

    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { room: true },
    });
    const countdownSeconds = round?.room.countdownSeconds || 30;
    const endsAt = new Date(Date.now() + countdownSeconds * 1000);

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        status: "COUNTDOWN",
        countdownEndsAt: endsAt,
      },
    });

    // Clear existing countdown timer if any
    const existingTimer = this.countdownTimers.get(roomId);
    if (existingTimer) clearInterval(existingTimer);

    // Broadcast initial countdown state
    let state = await this.getRoomState(roomId);
    this.broadcastRoomState(roomId, state);

    const timer = setInterval(async () => {
      const current = await prisma.gameRound.findUnique({
        where: { id: roundId },
        include: { tickets: true },
      });

      if (!current || current.status !== "COUNTDOWN") {
        clearInterval(timer);
        this.countdownTimers.delete(roomId);
        return;
      }

      const remainingMs = current.countdownEndsAt ? current.countdownEndsAt.getTime() - Date.now() : 0;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

      this.emitEvent(roomId, "countdown_tick", { countdown: remainingSec });

      if (remainingSec <= 0) {
        clearInterval(timer);
        this.countdownTimers.delete(roomId);
        await this.startRunningGame(roomId, roundId);
      }
    }, 1000);

    this.countdownTimers.set(roomId, timer);
  }

  /**
   * Starts ball drawing every 3.5 seconds and checks real tickets for winner
   */
  async startRunningGame(roomId: string, roundId: string) {
    // 1. Convert any remaining pending selections in this room into registered tickets
    const roomPending = this.pendingSelections.get(roomId);
    if (roomPending && roomPending.size > 0) {
      for (const [clientId, cards] of roomPending.entries()) {
        if (!cards || cards.length === 0) continue;
        const numericId = String(clientId).replace(/\D/g, "");
        const tgId = BigInt(numericId.length > 0 ? numericId : "999001");
        try {
          await this.buyTickets({
            roomId,
            telegramId: tgId,
            cartelaNumbers: cards,
          });
        } catch {}
      }
      this.pendingSelections.delete(roomId);
    }

    // 2. Check that the round actually has tickets to play
    const currentRound = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { tickets: true, room: true },
    });

    if (!currentRound || currentRound.tickets.length === 0) {
      await prisma.gameRound.update({
        where: { id: roundId },
        data: { status: "WAITING", countdownEndsAt: null },
      });
      const st = await this.getRoomState(roomId);
      this.broadcastRoomState(roomId, st);
      return;
    }

    // Generate shuffled deck 1-75
    const deck = Array.from({ length: 75 }, (_, i) => i + 1);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    await prisma.gameRound.update({
      where: { id: roundId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        shuffledDeck: deck,
        calledNumbers: [],
      },
    });

    const initialRound = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { room: true },
    });
    const intervalMs = initialRound?.room.callIntervalMs || 3500;

    // Start timer and register it BEFORE getRoomState to prevent any race condition
    this.startBallCallingTimer(roomId, roundId, intervalMs);

    this.emitEvent(roomId, "game_started", { roomId, roundId });

    const state = await this.getRoomState(roomId);
    this.broadcastRoomState(roomId, state);
  }

  /**
   * Dedicated ball calling timer that draws balls at intervalMs and checks for win
   * Uses a self-pacing recursive timer to guarantee strictly even gaps and prevent DB race conditions.
   */
  startBallCallingTimer(roomId: string, roundId: string, intervalMs: number = 3500) {
    const existing = this.callTimers.get(roomId);
    if (existing) {
      clearInterval(existing);
      clearTimeout(existing);
    }

    let isStopped = false;

    const tick = async () => {
      if (isStopped) return;
      const startTime = Date.now();

      try {
        const round = await prisma.gameRound.findUnique({
          where: { id: roundId },
          include: {
            room: true,
            tickets: {
              include: {
                user: { select: { id: true, firstName: true, username: true, telegramId: true } },
              },
            },
          },
        });

        if (!round || round.status !== "RUNNING" || round.tickets.length === 0) {
          isStopped = true;
          this.callTimers.delete(roomId);
          if (round && round.tickets.length === 0) {
            await prisma.gameRound.update({
              where: { id: roundId },
              data: { status: "FINISHED", endedAt: new Date() },
            });
            setTimeout(async () => {
              await this.getOrCreateActiveRound(roomId);
              const nextState = await this.getRoomState(roomId);
              this.broadcastRoomState(roomId, nextState);
            }, 1000);
          }
          return;
        }

        const remainingDeck = [...round.shuffledDeck];
        if (remainingDeck.length === 0) {
          isStopped = true;
          this.callTimers.delete(roomId);
          await prisma.gameRound.update({
            where: { id: roundId },
            data: { status: "FINISHED", endedAt: new Date() },
          });
          const delaySec = round.room?.nextGameDelaySeconds ?? 6;
          this.roomNextGameAvailableAt.set(roomId, Date.now() + delaySec * 1000);
          this.emitEvent(roomId, "game_ended", { reason: "NO_BALLS_LEFT", delaySeconds: delaySec });
          setTimeout(async () => {
            await this.getOrCreateActiveRound(roomId);
            const nextState = await this.getRoomState(roomId);
            this.broadcastRoomState(roomId, nextState);
          }, delaySec * 1000);
          return;
        }

        const nextNum = remainingDeck.shift()!;
        const nextCalled = [...round.calledNumbers, nextNum];

        await prisma.gameRound.update({
          where: { id: roundId },
          data: {
            calledNumbers: nextCalled,
            shuffledDeck: remainingDeck,
          },
        });

        const letter = getLetterForNumber(nextNum);
        const recentCalls = nextCalled
          .slice(-3)
          .reverse()
          .map((n) => ({ num: n, letter: getLetterForNumber(n) }));

        this.emitEvent(roomId, "ball_called", {
          ball: { letter, num: nextNum },
          calledNumbers: nextCalled,
          recentCalls,
        });

        // Check REAL tickets for winner
        const calledSet = new Set(nextCalled);
        const freeCenter = round.room?.freeCenter ?? true;
        const winningTickets: Array<{
          ticket: typeof round.tickets[0];
          keys: Set<string>;
        }> = [];

        for (const ticket of round.tickets) {
          const grid = generateDeterministicCartela(ticket.cartelaNumber);
          const win = checkCartelaWin(grid, calledSet, freeCenter);
          if (win.hasWon) {
            winningTickets.push({ ticket, keys: win.winningKeys });
          }
        }

        // If at least one REAL player won!
        if (winningTickets.length > 0) {
          isStopped = true;
          this.callTimers.delete(roomId);
          await this.handleWinner(roomId, roundId, winningTickets);
          return;
        } else if (nextCalled.length >= 75 || remainingDeck.length === 0) {
          // All 75 balls called without winner
          isStopped = true;
          this.callTimers.delete(roomId);
          await prisma.gameRound.update({
            where: { id: roundId },
            data: { status: "FINISHED", endedAt: new Date() },
          });
          const delaySec = round.room?.nextGameDelaySeconds ?? 6;
          this.roomNextGameAvailableAt.set(roomId, Date.now() + delaySec * 1000);
          this.emitEvent(roomId, "game_ended", { reason: "ALL_BALLS_CALLED", delaySeconds: delaySec });
          setTimeout(async () => {
            await this.getOrCreateActiveRound(roomId);
            const nextState = await this.getRoomState(roomId);
            this.broadcastRoomState(roomId, nextState);
          }, delaySec * 1000);
          return;
        }
      } catch (err) {
        console.error(`[Round ${roundId}] Error in ball draw:`, err);
      }

      // Schedule next ball with precise pacing to maintain exact intervalMs:
      if (!isStopped && this.callTimers.has(roomId)) {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(1200, intervalMs - elapsed);
        const nextTimer = setTimeout(tick, delay);
        this.callTimers.set(roomId, nextTimer);
      }
    };

    const firstTimer = setTimeout(tick, intervalMs);
    this.callTimers.set(roomId, firstTimer);
  }

  /**
   * Handles real winner: awards derash to winner's wallet and emits event
   */
  async handleWinner(
    roomId: string,
    roundId: string,
    winningTickets: Array<{
      ticket: any;
      keys: Set<string>;
    }>
  ) {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      include: { room: true },
    });
    if (!round) return;

    const totalPrize = Number(round.prizePool);
    const splitPrize = Math.floor(totalPrize / winningTickets.length);

    // Credit real winner(s)
    await prisma.$transaction(async (tx) => {
      for (const winItem of winningTickets) {
        const balAfter = await creditWinTx(tx, winItem.ticket.userId, splitPrize, roundId);
        await tx.gameTicket.update({
          where: { id: winItem.ticket.id },
          data: { status: "WINNER", prizeWon: centsToDecimal(toCents(splitPrize)) },
        });
        if (winItem.ticket.user?.telegramId) {
          realtimeService.notifyWalletUpdate(winItem.ticket.user.telegramId, {
            balance: Number(balAfter),
            prize: splitPrize,
            reason: "WIN_PRIZE",
          });
        }
      }

      await tx.gameRound.update({
        where: { id: roundId },
        data: { status: "FINISHED", endedAt: new Date() },
      });
    });

    realtimeService.notifyAdminEvent({ type: "game_finished", payload: { roundId, roomId } });

    const delaySec = round.room?.nextGameDelaySeconds ?? 6;
    this.roomNextGameAvailableAt.set(roomId, Date.now() + delaySec * 1000);

    const winnersPayload: WinnerResult = {
      winners: winningTickets.map((w) => ({
        name: `Cartela #${w.ticket.cartelaNumber}`,
        avatar: "🎯",
        cardNo: w.ticket.cartelaNumber,
        telegramId: w.ticket.user?.telegramId ? String(w.ticket.user.telegramId) : undefined,
        userId: w.ticket.userId,
      })),
      winningCartelaNo: winningTickets[0].ticket.cartelaNumber,
      winningPatternKeys: Array.from(winningTickets[0].keys),
      derash: splitPrize,
      delaySeconds: delaySec,
    };

    this.emitEvent(roomId, "game_won", winnersPayload);

    // After delaySec seconds, initialize the next WAITING round
    setTimeout(async () => {
      await this.getOrCreateActiveRound(roomId);
      const nextState = await this.getRoomState(roomId);
      this.broadcastRoomState(roomId, nextState);
    }, delaySec * 1000);
  }
}

export const gameRoundService = new GameRoundService();
