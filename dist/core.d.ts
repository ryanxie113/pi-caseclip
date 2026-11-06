export type Entry = {
    type: string;
    id: string;
    parentId?: string | null;
    message?: any;
};
export type ToolRecord = {
    callId: string;
    name: string;
    input?: string;
    output?: string;
    isError?: boolean;
    resultEntryId?: string;
    missingResult?: boolean;
};
export type CaseCard = {
    schemaVersion: 1;
    id: string;
    createdAt: string;
    projectKey: string;
    title: string;
    feedback: string;
    prompt?: string;
    answer?: string;
    tools?: ToolRecord[];
    source?: {
        sessionId: string;
        leafId: string | null;
        promptEntryId: string;
        answerEntryId?: string;
    };
    limitations: string[];
};
export declare const ID_PATTERN: RegExp;
export declare function projectKey(cwd: string): string;
export declare function redact(value: string): string;
/** Use only the active branch. The capture unit is the latest USER request, not one model step. */
export declare function capture(entries: Entry[], meta: {
    sessionId: string;
    leafId: string | null;
    cwd: string;
}, feedback: string): CaseCard;
export declare function validateCard(value: unknown): asserts value is CaseCard;
export declare function editable(card: CaseCard): string;
export declare function applyEdit(original: CaseCard, json: string): CaseCard;
export declare function markdown(c: CaseCard): string;
