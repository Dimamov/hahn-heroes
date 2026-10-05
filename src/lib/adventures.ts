import data from '../../content/adventures.json';

export interface LabCase {
  id: string; title: string; icon: string; intro: string;
  clues: { icon: string; name: string; text: string }[];
  steps: { id: string; q: string; choices: string[] }[];
}
export interface ChronicleStep { id: string; lore: string; q: string; choices: string[] }
export interface Chronicle { id: string; title: string; icon: string; intro: string; steps: ChronicleStep[] }

export const LAB_CASES = data.lab as LabCase[];
export const CHRONICLE = data.chronicle as Chronicle;

/** What the server remembers about a case or trail: which question steps this hero has solved. */
export interface AdvProgress { case: string; kind: 'lab' | 'chronicle'; solved: string[]; done: boolean }
export interface AdvAnswerResult { correct: boolean; rightChoice?: number; explanation?: string; first?: boolean }
export interface AdvDone { repeat: boolean; card: string; coins?: number }
