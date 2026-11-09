import type { Role } from 'chessops/types';

export const MATERIAL_VALUES: Record<Role, number> = {
  pawn: 100, knight: 300, bishop: 300, rook: 500, queen: 900, king: 0,
};
