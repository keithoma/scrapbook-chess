export const CLEAN_GAIN_EXAMPLES = [
  {
    name: 'Loose pawn',
    pgn: '[SetUp "1"]\n[FEN "1n4k1/pp3ppp/2p5/8/4N3/8/PP3PPP/6K1 b - - 0 1"]\n\n1... c5 2. Nxc5 *',
  },
  {
    name: 'Pawn won, then a later blunder',
    pgn: '[SetUp "1"]\n[FEN "1n4k1/pp3ppp/2p5/8/4N3/8/PP3PPP/6K1 b - - 0 1"]\n\n1... c5 2. Nxc5 Nd7 3. Ne6 fxe6 *',
  },
  { name: 'Equal pawn exchange', pgn: '1. e4 d5 2. exd5 Qxd5 *' },
  { name: "King’s Gambit", pgn: '1. e4 e5 2. f4 exf4 *' },
  { name: 'Exchange with a checking intermezzo', pgn: '1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 *' },
  { name: 'Tactical pawn capture', pgn: '1. e4 e5 2. Nf3 f6 3. Nxe5 *' },
] as const;
