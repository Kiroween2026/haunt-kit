// Owner: Viviana (built by Yadnesh while Viviana is unavailable).
// The host side of a game night: players from the room, bots, the session, what phones see.
import type { HauntRoom, PlayerInfo } from "@haunt-kit/host-sdk";
import type { UiView } from "@haunt-kit/protocol";
import { Bot, DIFFICULTIES, type Difficulty } from "../game/bots";
import { MAX_PLAYERS, Session } from "../game/session";
import { NO_INPUT, type GameEvent, type Input, type Player, type PlayerId } from "../game/types";
import { InputTracker } from "./inputs";
import { freeBotName, freeColor } from "./palette";
import { snapshot, type Snapshot } from "./snapshot";
import { play, soundFor } from "./sound";
import type { Mode } from "./connect";

export type LobbyView = {
  mode: Mode;
  code: string;
  joinUrl: string;
  qrSvg: string;
  status: string;
  players: Player[];
  canStart: boolean;
  maxPlayers: number;
};

export type PartyView = { lobby: LobbyView; game: Snapshot; toast: string | null };

export class Party {
  readonly session = new Session();
  readonly tracker = new InputTracker();
  private readonly humans = new Map<PlayerId, Player>();
  private readonly bots = new Map<PlayerId, { player: Player; brain: Bot }>();
  private readonly listeners = new Set<(view: PartyView) => void>();
  private lastUi = "";
  private toast: string | null = null;
  private nextBot = 1;
  private offs: (() => void)[] = [];
  private seed = Date.now() % 2 ** 31;

  constructor(
    readonly room: HauntRoom,
    readonly mode: Mode,
    private readonly sounds = true,
  ) {
    for (const p of room.players) this.addHuman(p);
    this.offs.push(
      room.on("player_joined", (p) => this.addHuman(p)),
      room.on("player_left", ({ playerId }) => this.removeHuman(playerId)),
      room.on("frames", ({ playerId, samples }) => this.tracker.onFrames(playerId, samples)),
      room.on("gesture", ({ playerId, event }) => this.tracker.onGesture(playerId, event)),
    );
  }

  // ---------- people ----------

  private addHuman(info: PlayerInfo): void {
    if (this.humans.has(info.playerId)) return;
    this.humans.set(info.playerId, {
      id: info.playerId,
      name: info.name,
      color: info.color,
      bot: false,
      left: false,
    });
    this.toast = `${info.name} joined`;
    this.sendUi(
      this.session.phase === "lobby"
        ? this.session.phoneUi()
        : { view: "wait", title: "Next game", hint: "You'll join when this one ends." },
      info.playerId,
    );
    this.emit();
  }

  private removeHuman(id: PlayerId): void {
    const p = this.humans.get(id);
    if (!p) return;
    this.humans.delete(id);
    this.tracker.forget(id);
    this.session.playerLeft(id);
    this.toast = `${p.name} left`;
    this.emit();
  }

  /** Everyone who would play if you pressed Start. */
  get lobbyPlayers(): Player[] {
    return [...this.humans.values(), ...[...this.bots.values()].map((b) => b.player)].slice(0, MAX_PLAYERS);
  }

  addBot(difficulty: Difficulty): boolean {
    if (this.session.phase !== "lobby" || this.humans.size + this.bots.size >= MAX_PLAYERS) return false;
    const used = this.lobbyPlayers;
    const id = `bot-${this.nextBot++}`;
    const name = freeBotName(used.map((p) => p.name));
    const player: Player = { id, name, color: freeColor(used.map((p) => p.color)), bot: true, left: false };
    this.bots.set(id, { player, brain: new Bot(difficulty, this.seed + this.nextBot) });
    this.emit();
    return true;
  }

  removeBot(id: PlayerId): void {
    if (this.session.phase !== "lobby") return;
    this.bots.delete(id);
    this.emit();
  }

  clearBots(): void {
    if (this.session.phase !== "lobby") return;
    this.bots.clear();
    this.emit();
  }

  botDifficulty(id: PlayerId): Difficulty | null {
    return this.bots.get(id)?.brain.difficulty ?? null;
  }

  // ---------- the game ----------

  start(): boolean {
    if (this.session.phase !== "lobby" && this.session.phase !== "winner") return false;
    if (this.session.phase === "winner") this.session.reset();
    this.seed = (this.seed * 1103515245 + 12345) % 2 ** 31;
    const ok = this.session.start(this.lobbyPlayers, this.seed);
    if (ok) {
      this.tracker.resetFrozen();
      this.pushUi();
    }
    this.emit();
    return ok;
  }

  /** Back to the lobby after the winner screen. Bots stay, so you can play again. */
  playAgain(): void {
    this.session.reset();
    this.lastUi = "";
    this.pushUi();
    this.emit();
  }

  /** Advances the game by `dtMs`. Call about 30 times a second. */
  tick(dtMs: number): void {
    const inputs = new Map<PlayerId, Input>();
    for (const id of this.humans.keys()) inputs.set(id, this.tracker.input(id));
    for (const [id, b] of this.bots) inputs.set(id, b.brain.think(dtMs, this.session.game));
    const before = this.session.phase;
    const kind = this.session.kind;
    const events = this.session.tick(dtMs, inputs);
    if (this.session.phase === "playing" && (before !== "playing" || kind !== this.session.kind))
      this.tracker.resetFrozen();
    this.react(events);
    this.pushUi();
    if (this.session.phase !== "lobby") this.emit();
  }

  private react(events: GameEvent[]): void {
    for (const e of events) {
      const s = soundFor(e);
      if (s && this.sounds) play(s);
      if (e.type === "out") {
        this.sendFeedback(e.playerId, { kind: "flash", color: "#ff5555", ms: 400 });
        this.toast = `${this.nameOf(e.playerId)} is out`;
      } else if (e.type === "word") {
        this.room.sendFeedback("all", { kind: "flash", color: "#50fa7b", ms: 300 });
        this.toast = `They spelled ${e.word}`;
      } else if (e.type === "letter") {
        this.room.sendFeedback("all", { kind: "flash", color: "#bd93f9", ms: 120 });
      }
    }
  }

  private nameOf(id: PlayerId): string {
    return this.humans.get(id)?.name ?? this.bots.get(id)?.player.name ?? "A ghost";
  }

  private sendFeedback(id: PlayerId, feedback: Parameters<HauntRoom["sendFeedback"]>[1]): void {
    if (this.humans.has(id)) this.room.sendFeedback(id, feedback);
  }

  // ---------- phones ----------

  private sendUi(ui: UiView, to: PlayerId | "all"): void {
    if (this.room.status === "connected") this.room.setUi(to, ui);
  }

  /** Sends the phones' view when it changes. */
  private pushUi(): void {
    const ui = this.session.phoneUi();
    const key = JSON.stringify(ui);
    if (key === this.lastUi) return;
    this.lastUi = key;
    this.sendUi(ui, "all");
  }

  // ---------- drawing ----------

  view(): PartyView {
    const lobby = this.lobbyPlayers;
    return {
      lobby: {
        mode: this.mode,
        code: this.room.code,
        joinUrl: this.room.joinUrl,
        qrSvg: this.room.qrSvg,
        status: this.room.status,
        players: lobby,
        canStart: lobby.length > 0,
        maxPlayers: MAX_PLAYERS,
      },
      game: snapshot(this.session),
      toast: this.toast,
    };
  }

  clearToast(): void {
    this.toast = null;
  }

  subscribe(fn: (view: PartyView) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const v = this.view();
    for (const fn of this.listeners) fn(v);
  }

  close(): void {
    this.offs.forEach((off) => off());
    this.listeners.clear();
    this.room.close();
  }
}

export { DIFFICULTIES, NO_INPUT };
