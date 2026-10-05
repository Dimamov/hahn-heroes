// Class vs class race: monthly class totals, shown by class name only.
export interface RaceClass { name: string; grade: number; members: number; total: number; rank: number; mine: boolean }
export interface RaceState { month: string; minMembers: number; classes: RaceClass[] }
