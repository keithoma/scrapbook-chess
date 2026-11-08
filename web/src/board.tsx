import { useLayoutEffect, useMemo, useRef } from 'react';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';
import type { Role } from 'chessops/types';
import type { Frame } from './game';
import { translate, type Locale } from './i18n';
import type { KnightForkCandidate } from './tactics/knight-forks';
import type { SkewerCandidate } from './tactics/skewers';

const pieceFiles: Record<Role, string> = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' };
interface LastMove { uci: string; beforeFen: string }
interface BoardProps {
  frame: Frame;
  flipped: boolean;
  locale: Locale;
  lastMove?: LastMove;
  fork?: KnightForkCandidate;
  skewer?: SkewerCandidate;
}

export function Board({ frame, flipped, locale, lastMove, fork, skewer }: BoardProps) {
  const board = useRef<HTMLDivElement>(null);
  const previous = useRef<{ frame: Frame; flipped: boolean; lastMove?: LastMove }>(undefined);
  const check = useMemo(() => Chess.fromSetup(parseFen(frame.fen).unwrap()).unwrap().isCheck(), [frame.fen]);
  const squares = Array.from({ length: 64 }, (_, i) => flipped ? (i >> 3) * 8 + 7 - i % 8 : (7 - (i >> 3)) * 8 + i % 8);

  // Animate adjacent replay positions only; jumps and board flips stay immediate.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { frame, flipped, lastMove };
    if (!before || before.flipped !== flipped || !board.current
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (before.frame.fen !== lastMove?.beforeFen && before.lastMove?.beforeFen !== frame.fen) return;
    const size = board.current.getBoundingClientRect().width / 8;
    const direction = flipped ? -1 : 1;
    const animations: Animation[] = [];
    for (const piece of frame.pieces) {
      if (before.frame.pieces.some(old => old.square === piece.square && old.color === piece.color && old.role === piece.role)) continue;
      const origins = before.frame.pieces.filter(old => old.color === piece.color && old.role === piece.role
        && !frame.pieces.some(current => current.square === old.square && current.color === old.color && current.role === old.role));
      if (origins.length !== 1) continue;
      const from = origins[0].square;
      const image = board.current.querySelector<HTMLElement>(`.piece[data-square="${piece.square}"]`);
      if (!image) continue;
      const x = (from % 8 - piece.square % 8) * size * direction;
      const y = ((piece.square >> 3) - (from >> 3)) * size * direction;
      animations.push(image.animate([
        { transform: `translate(${x}px, ${y}px)`, zIndex: 3 },
        { transform: 'translate(0, 0)', zIndex: 3 },
      ], { duration: 160, easing: 'ease-out' }));
    }
    return () => animations.forEach(animation => animation.cancel());
  }, [frame, flipped, lastMove?.uci, lastMove?.beforeFen]);

  const label = translate(locale, 'Chess position, {color} to move', { color: translate(locale, frame.turn === 'white' ? 'White' : 'Black') });
  return <div ref={board} className="board" role="img" aria-label={`${label}${frame.checkmate ? `, ${translate(locale, 'checkmate')}` : ''}`} data-testid="board" data-fen={frame.fen}>
    {squares.map((square, index) => {
      const piece = frame.pieces.find(p => p.square === square);
      const rank = square >> 3;
      const file = square % 8;
      const skewerSource = skewer?.lines.some(line => line.attacker === square);
      const skewerTarget = skewer?.lines.some(line => line.front.square === square || line.rear.square === square);
      const source = fork?.square === square || skewerSource;
      const target = fork?.targets.some(piece => piece.square === square) || skewerTarget;
      const moved = lastMove?.uci.slice(0, 2) === makeSquare(square) || lastMove?.uci.slice(2, 4) === makeSquare(square);
      const inCheck = check && piece?.role === 'king' && piece.color === frame.turn;
      return <div key={square} className={`square ${(rank + file) % 2 ? 'light' : 'dark'} ${moved ? 'last-move' : ''} ${inCheck ? 'in-check' : ''} ${source ? 'fork-source' : target ? 'fork-target' : ''}`} data-square={makeSquare(square)} data-fork-source={fork?.square === square || undefined} data-fork-target={fork?.targets.some(piece => piece.square === square) || undefined} data-skewer-source={skewerSource || undefined} data-skewer-target={skewerTarget || undefined}>
        {index % 8 === 0 && <span className="rank" aria-hidden="true">{rank + 1}</span>}
        {index >= 56 && <span className="file" aria-hidden="true">{'abcdefgh'[file]}</span>}
        {piece && <img className="piece" data-square={square} src={`/pieces/cburnett/${piece.color === 'white' ? 'w' : 'b'}${pieceFiles[piece.role]}.svg`} alt="" aria-hidden="true" draggable={false} width={45} height={45} />}
      </div>;
    })}
  </div>;
}
