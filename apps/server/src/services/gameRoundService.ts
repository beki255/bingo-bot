import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "../db/prisma.js";
import {
  toCents,
  centsToNumber,
  centsToDecimal,
  deductBetTx,
  creditWinTx,
} from "./walletService.js";
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
  calledNumbersSet: Set<number>
): { hasWon: boolean; winningKeys: Set<string> } {
  const isMarked = (r: number, c: number) => {
    if (r === 2 && c === 2) return true; // Center free
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
  winners: Array<{ name: string; avatar: string; cardNo: number }>;
  winningCartelaNo: number;
  winningPatternKeys: string[];
}

export class GameRoundService {
  private io: SocketIOServer | null = null;
  private callTimers: Map<string, NodeJS.Timeout> = new Map();
  private countdownTimers: Map<string, NodeJS.Timeout> = new Map();

  attachIO(io: SocketIOServer) {
    this.io = io;
    this.setupSocketEvents();
  }

  private setupSocketEvents() {
    if (!this.io) return;
    this.io.on("connection", (socket) => {
      socket.on("join_room", async (roomId: string) => {
        socket.join(`room_${roomId}`);
        const state = await this.getRoomState(roomId);
        socket.emit("room_state", state);
      });
    });
  }

  private broadcastRoomState(roomId: string, state: any) {
    if (!this.io) return;
    this.io.to(`room_${roomId}`).emit("room_state", state);
  }

  private emitEvent(roomId: string, event: string, payload: any) {
    if (!this.io) return;
    this.io.to(`room_${roomId}`).emit(event, payload);
  }

  /**
   * Retrieves active round or creates a new WAITING round for the given room
   */
  async getOrCreateActiveRound(roomId: string) {
    let round = await prisma.gameRound.findFirst({
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
              user: { select: { id: true, firstName: true, username: true } },
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
    const takenCards = round.tickets.map((t) => t.cartelaNumber);
    const uniqueUserIds = new Set(round.tickets.map((t) => t.userId));
    const playersCount = uniqueUserIds.size;
    const ticketsCount = round.tickets.length;

    // Real derash = 80% of total bets
    const totalPot = ticketsCount * stake;
    const derash = Math.floor(totalPot * 0.8);

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
      .slice(-4)
      .reverse()
      .map((num) => ({
        num,
        letter: getLetterForNumber(num),
      }));

    return {
      roomId,
      roundId: round.id,
      status: round.status,
      stake,
      minPlayers: 3, // Real rule: minimum 3 players/cards required to start countdown
      playersCount,
      ticketsCount,
      derash,
      takenCards,
      countdown: remainingCountdown,
      calledNumbers: round.calledNumbers,
      currentBall,
      recentCalls,
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

    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { wallet: true },
    });
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
    await prisma.$transaction(async (tx) => {
      await deductBetTx(tx, user.id, totalCost, round.id);

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

      // Update round pots
      const newTotalTickets = round.tickets.length + cartelaNumbers.length;
      const newTotalPot = newTotalTickets * stakeAmount;
      const newHouseCut = newTotalPot * 0.2;
      const newPrizePool = newTotalPot * 0.8;

      await tx.gameRound.update({
        where: { id: round.id },
        data: {
          totalPot: centsToDecimal(toCents(newTotalPot)),
          houseCutAmount: centsToDecimal(toCents(newHouseCut)),
          prizePool: centsToDecimal(toCents(newPrizePool)),
        },
      });
    });

    // 3. Check if threshold of 3 players/cards is reached to start countdown
    const updatedRound = await prisma.gameRound.findUnique({
      where: { id: round.id },
      include: { tickets: true },
    });

    const totalTicketsCount = updatedRound?.tickets.length || 0;
    const minRequired = 3;

    if (totalTicketsCount >= minRequired && updatedRound?.status === "WAITING") {
      await this.startCountdown(roomId, round.id);
    } else {
      const state = await this.getRoomState(roomId);
      this.broadcastRoomState(roomId, state);
    }

    return this.getRoomState(roomId);
  }

  /**
   * Starts the 45-second live countdown when >= 3 cards are registered
   */
  async startCountdown(roomId: string, roundId: string) {
    const countdownSeconds = 45;
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

    let state = await this.getRoomState(roomId);
    this.broadcastRoomState(roomId, state);

    // Call a ball every 3.5 seconds
    const callTimer = setInterval(async () => {
      const round = await prisma.gameRound.findUnique({
        where: { id: roundId },
        include: {
          tickets: {
            include: {
              user: { select: { id: true, firstName: true, username: true } },
            },
          },
        },
      });

      if (!round || round.status !== "RUNNING") {
        clearInterval(callTimer);
        this.callTimers.delete(roomId);
        return;
      }

      const remainingDeck = [...round.shuffledDeck];
      if (remainingDeck.length === 0) {
        clearInterval(callTimer);
        this.callTimers.delete(roomId);
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
        .slice(-4)
        .reverse()
        .map((n) => ({ num: n, letter: getLetterForNumber(n) }));

      this.emitEvent(roomId, "ball_called", {
        ball: { letter, num: nextNum },
        calledNumbers: nextCalled,
        recentCalls,
      });

      // Check REAL tickets for winner
      const calledSet = new Set(nextCalled);
      const winningTickets: Array<{
        ticket: typeof round.tickets[0];
        keys: Set<string>;
      }> = [];

      for (const ticket of round.tickets) {
        const grid = generateDeterministicCartela(ticket.cartelaNumber);
        const win = checkCartelaWin(grid, calledSet);
        if (win.hasWon) {
          winningTickets.push({ ticket, keys: win.winningKeys });
        }
      }

      // If at least one REAL player won!
      if (winningTickets.length > 0) {
        clearInterval(callTimer);
        this.callTimers.delete(roomId);
        await this.handleWinner(roomId, roundId, winningTickets);
      }
    }, 3500);

    this.callTimers.set(roomId, callTimer);
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
        await creditWinTx(tx, winItem.ticket.userId, splitPrize, roundId);
        await tx.gameTicket.update({
          where: { id: winItem.ticket.id },
          data: { status: "WINNER", prizeWon: centsToDecimal(toCents(splitPrize)) },
        });
      }

      await tx.gameRound.update({
        where: { id: roundId },
        data: { status: "FINISHED", endedAt: new Date() },
      });
    });

    const winnersPayload: WinnerResult = {
      winners: winningTickets.map((w) => ({
        name: w.ticket.user.username ? `@${w.ticket.user.username}` : w.ticket.user.firstName || "Player",
        avatar: (w.ticket.user.firstName?.[0] || "P").toUpperCase(),
        cardNo: w.ticket.cartelaNumber,
      })),
      winningCartelaNo: winningTickets[0].ticket.cartelaNumber,
      winningPatternKeys: Array.from(winningTickets[0].keys),
    };

    this.emitEvent(roomId, "game_won", winnersPayload);

    // After 6 seconds, initialize the next WAITING round
    setTimeout(async () => {
      await this.getOrCreateActiveRound(roomId);
      const nextState = await this.getRoomState(roomId);
      this.broadcastRoomState(roomId, nextState);
    }, 6000);
  }
}

export const gameRoundService = new GameRoundService();
