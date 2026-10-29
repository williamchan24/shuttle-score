import { describe, expect, it } from 'vitest';
import { call, gameWonBy, newMatch, pointFor, rally, receiverName, serverName, serviceCourt, type Config, type MatchState, type Side } from './rules';

const singles: Config = { mode: 'singles', bestOf: 3, names: { A: ['Brandon', ''], B: ['Jun Hao', ''] }, firstServer: 'A' };
const doubles: Config = { mode: 'doubles', bestOf: 3, names: { A: ['A1', 'A2'], B: ['B1', 'B2'] }, firstServer: 'A' };

/** Play a run of rallies, e.g. 'AAB' = A, A, then B. */
const play = (s: MatchState, rallies: string) => [...rallies].reduce((st, r) => rally(st, r as Side), s);
const repeat = (side: Side, n: number) => side.repeat(n);

describe('winning a game', () => {
  it('is 21 with a 2-point lead, extends from 20-all, and caps at 30', () => {
    expect(gameWonBy({ A: 21, B: 19 }, 'A')).toBe(true);
    expect(gameWonBy({ A: 21, B: 20 }, 'A')).toBe(false);
    expect(gameWonBy({ A: 22, B: 20 }, 'A')).toBe(true);
    expect(gameWonBy({ A: 29, B: 28 }, 'A')).toBe(false);
    expect(gameWonBy({ A: 30, B: 29 }, 'A')).toBe(true);
  });

  it('starts the next game at love-all, with the game winner serving and ends changed', () => {
    let s = play(newMatch(singles), repeat('B', 21));
    expect(s.games).toEqual([{ A: 0, B: 21 }]);
    expect(s.score).toEqual({ A: 0, B: 0 });
    expect(s.server).toBe('B');
    expect(s.endsSwapped).toBe(true);
    expect(s.event).toBe('game');
    s = play(s, repeat('A', 21));
    expect(s.gamesWon).toEqual({ A: 1, B: 1 });
    expect(s.endsSwapped).toBe(false);
  });

  it('ends a best-of-3 match at two games and ignores further rallies', () => {
    const s = play(newMatch(singles), repeat('A', 42));
    expect(s.winner).toBe('A');
    expect(s.event).toBe('match');
    expect(rally(s, 'B')).toBe(s);
  });

  it('ends a 1-game match after one game', () => {
    const s = play(newMatch({ ...singles, bestOf: 1 }), repeat('B', 21));
    expect(s.winner).toBe('B');
  });
});

describe('interval and changing ends', () => {
  it('calls the interval when the leader first reaches 11, once a game', () => {
    let s = play(newMatch(singles), repeat('A', 11));
    expect(s.event).toBe('interval');
    expect(s.endsSwapped).toBe(false);
    s = play(s, 'B');
    expect(s.event).toBe(null);
  });

  it('changes ends at 11 in the deciding game', () => {
    let s = play(newMatch(singles), repeat('A', 21) + repeat('B', 21)); // 1 game all, ends back to start
    expect(s.endsSwapped).toBe(false);
    s = play(s, repeat('B', 11));
    expect(s.event).toBe('change-ends');
    expect(s.endsSwapped).toBe(true);
  });
});

describe('singles service court', () => {
  it('serves from the right on an even score and the left on an odd one', () => {
    let s = newMatch(singles);
    expect(serviceCourt(s)).toBe('right');
    s = rally(s, 'A'); // 1-0, A still serving
    expect(serviceCourt(s)).toBe('left');
    s = rally(s, 'B'); // 1-1, B serves on 1
    expect(s.server).toBe('B');
    expect(serviceCourt(s)).toBe('left');
    s = rally(s, 'B'); // B on 2
    expect(serviceCourt(s)).toBe('right');
  });
});

describe('doubles service rotation', () => {
  it('follows the BWF sequence', () => {
    let s = newMatch(doubles);
    expect([serverName(s), receiverName(s), serviceCourt(s)]).toEqual(['A1', 'B1', 'right']);
    s = rally(s, 'A'); // 1-0: A1 serves again, A1 and A2 swap
    expect([serverName(s), receiverName(s), serviceCourt(s)]).toEqual(['A1', 'B2', 'left']);
    s = rally(s, 'B'); // 1-1: service over, B on 1 -> the B player in the left court serves (B2)
    expect([serverName(s), receiverName(s), serviceCourt(s)]).toEqual(['B2', 'A1', 'left']);
    s = rally(s, 'B'); // 1-2: B2 serves again, B partners swap
    expect([serverName(s), receiverName(s), serviceCourt(s)]).toEqual(['B2', 'A2', 'right']);
    s = rally(s, 'A'); // 2-2: service over, A on 2 -> the A player in the right court (A2)
    expect([serverName(s), receiverName(s), serviceCourt(s)]).toEqual(['A2', 'B2', 'right']);
  });
});

describe('game and match point', () => {
  it('spots them for either side', () => {
    let s = play(newMatch(singles), repeat('A', 20));
    expect(pointFor(s)).toEqual({ side: 'A', kind: 'game' });
    s = play(s, repeat('A', 1) + repeat('A', 20)); // A wins game 1, then 20-0 in game 2
    expect(pointFor(s)).toEqual({ side: 'A', kind: 'match' });
    expect(pointFor(newMatch(singles))).toBe(null);
  });
});

describe('umpire calls', () => {
  it('reads like an umpire', () => {
    const start = newMatch(singles);
    expect(call(null, start)).toBe('Love all, play');
    const a1 = rally(start, 'A');
    expect(call(start, a1)).toBe('1, love');
    const b1 = rally(a1, 'B');
    expect(call(a1, b1)).toBe('Service over, 1 all');
    const at20 = play(start, repeat('A', 20) + repeat('B', 18));
    const gp = rally(at20, 'B'); // 20-19, B serving, A has game point
    expect(call(at20, gp)).toBe('19, 20 game point');
    const eleven = play(start, repeat('A', 10));
    expect(call(eleven, rally(eleven, 'A'))).toBe('11, love, interval');
  });
});
