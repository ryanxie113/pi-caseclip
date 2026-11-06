import { type CaseCard } from './core.js';
export declare function defaultRoot(): string;
export declare class CaseStore {
    readonly root: string;
    readonly project: string;
    readonly dir: string;
    constructor(root: string, project: string);
    private ensure;
    private path;
    load(id: string): CaseCard;
    list(): {
        cards: CaseCard[];
        skipped: number;
    };
    save(card: CaseCard): string;
    private change;
    update(original: CaseCard, next: CaseCard): void;
    remove(original: CaseCard): void;
    export(card: CaseCard, format: 'md' | 'json'): string;
}
