import { useMemo, useState } from 'react';
import type { Color } from 'chessops/types';
import type { ImportedGame } from '../../shared/contracts';
import { gameIdentity, type GameGrant } from './achievements/collection';
import { parseGame, type ReplayGame } from './game';
import { CheckGames, type useProfile } from './profile';
import { hasCompleteAnalysis } from './review-state';
import type { Checkpoint } from './storage';
import { translate, type Locale, type Message } from './i18n';

export interface LibraryEntry {
  id: string;
  game: ReplayGame;
  color?: Color;
  collected: boolean;
  source: string;
  status: 'Needs analysis' | 'Analysis paused' | 'Analysis saved' | 'Analysis complete' | 'Ready to review';
}

export function gameLibrary(checkpoints: Checkpoint[], grants: GameGrant[], imported: ImportedGame[]) {
  const records = new Map<string, { pgn: string; color?: Color; collected: boolean; source: string; grant?: GameGrant; imported?: ImportedGame }>();
  let invalid = 0;
  for (const checkpoint of checkpoints) {
    try {
      const game = parseGame(checkpoint.pgn);
      records.set(gameIdentity(game), { pgn: game.pgn, collected: false, source: 'Local PGN' });
    } catch { invalid++; }
  }
  for (const grant of grants) records.set(grant.id, { pgn: grant.pgn, color: grant.color, collected: true, grant, source: grant.source?.platform === 'lichess' ? 'Lichess' : grant.source?.platform === 'chesscom' ? 'chess.com' : 'Local PGN' });
  for (const game of imported) records.set(game.id, { pgn: game.pgn, color: game.color, collected: !!game.collected || grants.some(grant => grant.id === game.id), source: game.platform === 'lichess' ? 'Lichess' : 'chess.com', imported: game });
  const entries: LibraryEntry[] = [];
  const local = new Map(checkpoints.map(checkpoint => [checkpoint.pgn, checkpoint]));
  for (const [id, record] of records) {
    try {
      const parsed = parseGame(record.pgn);
      const game = record.imported ? { ...parsed, timeControl: record.imported.timeControl, startedAt: record.imported.startedAt } : record.grant ? { ...parsed, timeControl: record.grant.timeControl ?? parsed.timeControl, startedAt: record.grant.startedAt ?? parsed.startedAt } : parsed;
      const checkpoint = local.get(game.pgn);
      entries.push({ id, game, color: record.color, collected: record.collected, source: record.source,
        status: hasCompleteAnalysis(game, checkpoint) ? record.color ? 'Ready to review' : 'Analysis complete' : checkpoint?.results.length ? 'Analysis paused' : record.imported?.analyzed ? 'Analysis saved' : 'Needs analysis' });
    } catch { invalid++; }
  }
  entries.sort((a, b) => (b.game.startedAt ?? 0) - (a.game.startedAt ?? 0) || b.game.timestamp.localeCompare(a.game.timestamp));
  return { entries, invalid };
}

export function gameDate(game: ReplayGame, locale: Locale) {
  return game.startedAt !== undefined && Number.isFinite(game.startedAt)
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(game.startedAt)
    : game.timestamp || translate(locale, 'Date unavailable');
}

function outcome(entry: LibraryEntry): Message | undefined {
  if (entry.game.result === '1/2-1/2') return 'Draw';
  if (!['1-0', '0-1'].includes(entry.game.result)) return 'Unfinished';
  if (entry.color) return (entry.game.result === '1-0') === (entry.color === 'white') ? 'Win' : 'Loss';
}

export function GameRows({ entries, locale, busy, activeId, working, onOpen }: {
  entries: LibraryEntry[]; locale: Locale; busy: boolean; activeId?: string; working?: boolean; onOpen: (pgn: string) => void;
}) {
  const t = (key: Message) => translate(locale, key);
  return <ul className="game-list">{entries.map(entry => {
    const opponent = entry.color ? entry.game[entry.color === 'white' ? 'black' : 'white'] : `${entry.game.white} ${t('vs')} ${entry.game.black}`;
    const result = outcome(entry);
    const status = activeId === entry.id && working ? 'Analyzing…' : entry.status;
    return <li className="game-row" key={entry.id} data-testid={`library-${entry.id}`}>
      <div className="game-players"><strong>{opponent}</strong><span>{entry.source === 'Local PGN' ? t('Local PGN') : entry.source}{entry.color && ` · ${t(entry.color === 'white' ? 'White' : 'Black')}`}</span></div>
      <div className="game-meta"><span>{gameDate(entry.game, locale)}</span><span>{entry.game.timeControl || '—'}</span></div>
      <div className="game-result"><strong>{result ? t(result) : entry.game.result}</strong><span>{entry.game.result}</span></div>
      <div className="game-state"><span className={`status-badge ${status === 'Ready to review' ? 'status-ready' : ''}`}>{status === 'Analyzing…' && <span className="spinner" aria-hidden="true" />}{t(status)}</span><span>{t(entry.collected ? 'Rewards collected' : 'Awaiting review')}</span></div>
      <button className="secondary-button" disabled={busy} onClick={() => onOpen(entry.game.pgn)}>{t(entry.status === 'Ready to review' ? 'Review game' : 'Select game')}</button>
    </li>;
  })}</ul>;
}

export function HomeView({ profile, entries, invalid, locale, busy, activeId, working, loading, failed, onOpen, onNavigate }: {
  profile: ReturnType<typeof useProfile>; entries: LibraryEntry[]; invalid: number; locale: Locale; busy: boolean; activeId: string; working: boolean;
  loading: boolean; failed: boolean; onOpen: (pgn: string) => void; onNavigate: (path: string) => void;
}) {
  const t = (key: Message) => translate(locale, key);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const fresh = entries.filter(entry => discovered.includes(entry.id));
  const waiting = entries.filter(entry => !entry.collected);
  return <section className="page-section" aria-labelledby="home-title">
    <div className="page-heading"><div><p className="eyebrow">{t('Your chess, a little further')}</p><h1 id="home-title">{t('Home')}</h1><p>{t('Bring in your games, discover your progress, and revisit the moves that matter.')}</p></div>
      <button className="secondary-button" onClick={() => onNavigate('/profile')}>{t('Manage accounts')}</button></div>
    <CheckGames key={profile.user?.id ?? 'guest'} profile={profile} locale={locale} onDiscovered={setDiscovered} />
    <div className="summary-grid">
      {([['Games', entries.length], ['Awaiting review', waiting.length], ['Ready to review', waiting.filter(entry => entry.status === 'Ready to review').length]] as const).map(([label, count]) => <div className="summary-card" key={label}><span>{t(label)}</span><strong>{new Intl.NumberFormat(locale).format(count)}</strong></div>)}
    </div>
    {(failed || invalid > 0) && <p className="error-state" role="alert">{t('Some saved games could not be read. Reload to try again.')}</p>}
    {loading ? <p className="empty-state" role="status"><span className="spinner" aria-hidden="true" />{t('Loading your games…')}</p> : <>
      {!!fresh.length && <div className="list-section"><h2>{t('Newly discovered')}</h2><GameRows entries={fresh} {...{ locale, busy, activeId, working, onOpen }} /></div>}
      <div className="list-section"><div className="section-heading"><h2>{t('Games awaiting review')}</h2><button className="text-button" onClick={() => onNavigate('/history')}>{t('View history')}</button></div>
        {waiting.length ? <GameRows entries={waiting.slice(0, 6)} {...{ locale, busy, activeId, working, onOpen }} /> : <div className="empty-state"><strong>{t(entries.length ? 'You are all caught up.' : 'Your next game starts here.')}</strong><p>{t(entries.length ? 'Check for new games or revisit a game in History.' : 'Link a chess account or import a PGN below. You can also explore an example game.')}</p></div>}
      </div>
      {!!entries.filter(entry => entry.collected).length && <div className="list-section"><h2>{t('Recent games')}</h2><GameRows entries={entries.filter(entry => entry.collected).slice(0, 4)} {...{ locale, busy, activeId, working, onOpen }} /></div>}
    </>}
  </section>;
}

export function HistoryView({ entries, invalid, locale, busy, activeId, working, loading, failed, onOpen }: {
  entries: LibraryEntry[]; invalid: number; locale: Locale; busy: boolean; activeId: string; working: boolean; loading: boolean; failed: boolean; onOpen: (pgn: string) => void;
}) {
  const t = (key: Message) => translate(locale, key);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState('all');
  const filtered = useMemo(() => entries.filter(entry => `${entry.game.white} ${entry.game.black}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))
    && (source === 'all' || entry.source === source)
    && (filter === 'all' || filter === 'waiting' && !entry.collected || filter === 'collected' && entry.collected || filter === 'ready' && entry.status === 'Ready to review' || filter === 'analysis' && entry.status !== 'Ready to review' && entry.status !== 'Analysis complete')), [entries, query, filter, source, locale]);
  return <section className="page-section" aria-labelledby="history-title">
    <div className="page-heading"><div><p className="eyebrow">{t('Every game has a place')}</p><h1 id="history-title">{t('History')}</h1><p>{t('Your imported games and locally saved PGNs, ready to revisit.')}</p></div></div>
    <div className="filter-bar">
      <label>{t('Search players')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>{t('Game status')}<select aria-label={t('Game status')} value={filter} onChange={event => setFilter(event.target.value)}>{([['all', 'All games'], ['waiting', 'Awaiting review'], ['ready', 'Ready to review'], ['analysis', 'Needs analysis'], ['collected', 'Rewards collected']] as const).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select></label>
      <label>{t('Source')}<select aria-label={t('Source')} value={source} onChange={event => setSource(event.target.value)}><option value="all">{t('All sources')}</option><option>Lichess</option><option>chess.com</option><option value="Local PGN">{t('Local PGN')}</option></select></label>
    </div>
    {(failed || invalid > 0) && <p className="error-state" role="alert">{t('Some saved games could not be read. Reload to try again.')}</p>}
    {loading ? <p className="empty-state" role="status">{t('Loading your games…')}</p> : filtered.length ? <GameRows entries={filtered} {...{ locale, busy, activeId, working, onOpen }} /> : <p className="empty-state">{t(entries.length ? 'No games match these filters.' : 'No games yet. Import a game from Home to get started.')}</p>}
  </section>;
}
