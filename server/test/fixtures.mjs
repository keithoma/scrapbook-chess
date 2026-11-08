export const NOW = Date.UTC(2026, 10, 8, 12);
export function sample(platform = 'lichess', { now = NOW, id = 'Mock0001', name = 'noctu2nality', age = 3600_000 } = {}) {
  const started = now - age;
  const date = new Date(started).toISOString();
  const url = platform === 'lichess' ? `https://lichess.org/${id}` : `https://www.chess.com/game/live/${id === 'Mock0001' ? '999001' : id}`;
  const pgn = `[Event "rated rapid game"]\n[Site "${platform === 'lichess' ? url : 'Chess.com'}"]\n[Link "${url}"]\n[White "Opponent"]\n[Black "${name}"]\n[Result "0-1"]\n[UTCDate "${date.slice(0, 10).replaceAll('-', '.')}"]\n[UTCTime "${date.slice(11, 19)}"]\n[TimeControl "600+0"]\n\n1. f3 e5 2. g4 Qh4# 0-1`;
  return platform === 'lichess' ? { id, rated: true, variant: 'standard', speed: 'rapid', status: 'mate', createdAt: started,
    lastMoveAt: started + 60_000, players: { white: { user: { id: 'opponent', name: 'Opponent' } }, black: { user: { id: name, name } } }, clocks: [60000, 59000, 58000, 57000], pgn }
    : { url, pgn, rules: 'chess', time_class: 'rapid', time_control: '600+0', rated: true, end_time: (started + 60_000) / 1000,
      white: { username: 'Opponent', result: 'checkmated' }, black: { username: name, result: 'win' } };
}
export function upstream({ now = NOW, lichess = [sample()], chesscom = [sample('chesscom', { name: 'testchess' })], lichessStatus = 200, chesscomStatus = 200 } = {}) {
  return async input => {
    const url = new URL(input);
    if (url.hostname === 'lichess.org') return new Response(lichess.map(game => JSON.stringify(game)).join('\n'), { status: lichessStatus });
    if (chesscomStatus !== 200) return new Response('Unavailable', { status: chesscomStatus });
    if (url.pathname.endsWith('/archives')) return Response.json({ archives: [`https://api.chess.com/pub/player/testchess/games/${new Date(now).toISOString().slice(0, 7).replace('-', '/')}`] });
    return Response.json({ games: chesscom });
  };
}
