/**
 * Badminton scoring, as pure functions (no browser code) so it's easy to test.
 *
 * BWF rules: rally point scoring to 21. At 20-all a side must lead by 2; at 29-all the
 * next point wins (30 caps it). Best of 3 games (or 1). The winner of a game serves first
 * in the next. Ends change after each game, and at 11 in the deciding game.
 *
 * Service courts: the server serves from the right court when their side's score is even,
 * the left when it's odd.
 * Doubles: when the serving side wins a rally, the same player serves again and the two
 * partners swap courts. When the receiving side wins, they take the serve and nobody moves;
 * the server is whichever of them stands in the court their score says (even = right).
 */

export type Side = 'A' | 'B';
export type Court = 'right' | 'left';
export type Mode = 'singles' | 'doubles';

export interface Config {
  mode: Mode;
  bestOf: 1 | 3;
  /** One name per player: singles uses names[side][0], doubles both. */
  names: Record<Side, [string, string]>;
  firstServer: Side;
}

export interface Score {
  A: number;
  B: number;
}

export type MatchEvent = 'interval' | 'change-ends' | 'game' | 'match' | null;

export interface MatchState {
  config: Config;
  /** Finished games, in order. */
  games: Score[];
  score: Score;
  server: Side;
  /** Doubles: which player (0 or 1) of each side stands in their right service court. */
  right: Record<Side, 0 | 1>;
  /** Doubles: which player of the serving side is serving. */
  serverPlayer: 0 | 1;
  gamesWon: Score;
  winner: Side | null;
  /** True when side A is shown on the right-hand end (ends have changed an odd number of times). */
  endsSwapped: boolean;
  /** The interval at 11 has already happened in this game. */
  intervalDone: boolean;
  /** What just happened, for banners and the voice call. */
  event: MatchEvent;
}

export const other = (s: Side): Side => (s === 'A' ? 'B' : 'A');
const gamesNeeded = (c: Config) => (c.bestOf === 3 ? 2 : 1);

export function newMatch(config: Config): MatchState {
  return {
    config,
    games: [],
    score: { A: 0, B: 0 },
    server: config.firstServer,
    right: { A: 0, B: 0 },
    serverPlayer: 0,
    gamesWon: { A: 0, B: 0 },
    winner: null,
    endsSwapped: false,
    intervalDone: false,
    event: null,
  };
}

/** Does this score finish the game for `side`? */
export function gameWonBy(score: Score, side: Side): boolean {
  const a = score[side];
  const b = score[other(side)];
  return (a >= 21 && a - b >= 2) || a === 30;
}

/** The deciding game: both sides are one game from the match (always true in a 1-game match). */
export function isDecider(s: MatchState): boolean {
  const need = gamesNeeded(s.config);
  return s.gamesWon.A === need - 1 && s.gamesWon.B === need - 1;
}

/** Which service court the server serves from right now. */
export function serviceCourt(s: MatchState): Court {
  return s.score[s.server] % 2 === 0 ? 'right' : 'left';
}

/** Doubles: the receiver is the player diagonally opposite, i.e. in the same-named court. */
export function receiverPlayer(s: MatchState): 0 | 1 {
  const recv = other(s.server);
  return serviceCourt(s) === 'right' ? s.right[recv] : ((1 - s.right[recv]) as 0 | 1);
}

/** Display names of the server and receiver. */
export function serverName(s: MatchState): string {
  const i = s.config.mode === 'doubles' ? s.serverPlayer : 0;
  return s.config.names[s.server][i];
}
export function receiverName(s: MatchState): string {
  const i = s.config.mode === 'doubles' ? receiverPlayer(s) : 0;
  return s.config.names[other(s.server)][i];
}

export function sideName(c: Config, side: Side): string {
  return c.mode === 'doubles' ? `${c.names[side][0]} & ${c.names[side][1]}` : c.names[side][0];
}

/** The side that would win the game (and possibly the match) with the next rally, if any. */
export function pointFor(s: MatchState): { side: Side; kind: 'game' | 'match' } | null {
  if (s.winner) return null;
  for (const side of ['A', 'B'] as Side[]) {
    const next = { ...s.score, [side]: s.score[side] + 1 };
    if (gameWonBy(next, side)) {
      return { side, kind: s.gamesWon[side] + 1 === gamesNeeded(s.config) ? 'match' : 'game' };
    }
  }
  return null;
}

/** Award a rally to `side` and return the new state. */
export function rally(s: MatchState, side: Side): MatchState {
  if (s.winner) return s;
  const score = { ...s.score, [side]: s.score[side] + 1 };
  let { server, serverPlayer } = s;
  const right = { ...s.right };

  if (side === s.server) {
    // Serving side wins: same server, and in doubles the partners swap courts
    if (s.config.mode === 'doubles') right[side] = (1 - right[side]) as 0 | 1;
  } else {
    // Receiving side wins: they serve; the server is whoever stands in the court their score says
    server = side;
    serverPlayer = score[side] % 2 === 0 ? right[side] : ((1 - right[side]) as 0 | 1);
  }

  let next: MatchState = { ...s, score, server, serverPlayer, right, event: null };

  if (gameWonBy(score, side)) {
    const gamesWon = { ...s.gamesWon, [side]: s.gamesWon[side] + 1 };
    const games = [...s.games, score];
    if (gamesWon[side] === gamesNeeded(s.config)) {
      return { ...next, games, gamesWon, winner: side, event: 'match' };
    }
    // New game: the game's winner serves first from the right court, and ends change
    return {
      ...next,
      games,
      gamesWon,
      score: { A: 0, B: 0 },
      server: side,
      serverPlayer: right[side],
      endsSwapped: !s.endsSwapped,
      intervalDone: false,
      event: 'game',
    };
  }

  // The interval comes when the leading side first reaches 11; in the decider, ends change too
  if (!s.intervalDone && score[side] === 11 && score[other(side)] < 11) {
    const decider = isDecider(next);
    next = { ...next, intervalDone: true, event: decider ? 'change-ends' : 'interval' };
    if (decider) next.endsSwapped = !next.endsSwapped;
  }
  return next;
}

const say = (n: number) => (n === 0 ? 'love' : String(n));

/**
 * What an umpire would call after this rally, server's score first:
 * "Love all, play" · "Service over, 5, 3" · "14 all" · "20 game point 18" · "11, 6, interval".
 */
export function call(prev: MatchState | null, s: MatchState): string {
  if (!prev) return 'Love all, play';
  if (s.event === 'match') {
    const g = s.games[s.games.length - 1];
    return `Game, and match won by ${sideName(s.config, s.winner!)}, ${Math.max(g.A, g.B)}, ${Math.min(g.A, g.B)}`;
  }
  if (s.event === 'game') {
    const g = s.games[s.games.length - 1];
    const winner = g.A > g.B ? 'A' : 'B';
    return `Game won by ${sideName(s.config, winner)}, ${Math.max(g.A, g.B)}, ${Math.min(g.A, g.B)}. Love all, play`;
  }
  const parts: string[] = [];
  if (prev.server !== s.server) parts.push('Service over');
  const sv = s.score[s.server];
  const rc = s.score[other(s.server)];
  const gp = pointFor(s);
  if (sv === rc) parts.push(`${say(sv)} all`);
  else if (gp && gp.side === s.server) parts.push(`${say(sv)} ${gp.kind} point ${say(rc)}`);
  else if (gp) parts.push(`${say(sv)}, ${say(rc)} ${gp.kind} point`);
  else parts.push(`${say(sv)}, ${say(rc)}`);
  if (s.event === 'interval') parts.push('interval');
  if (s.event === 'change-ends') parts.push('interval, change ends');
  return parts.join(', ');
}
