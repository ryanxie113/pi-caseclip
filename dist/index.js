import { realpathSync } from 'node:fs';
import { capture, editable, applyEdit, markdown, projectKey } from './core.js';
import { CaseStore, defaultRoot } from './store.js';
const HELP = [
    'CaseClip · Save the mistake. Keep the evidence.',
    '/case save <what went wrong / expected behavior>',
    '/case list                  Browse cases for this project',
    '/case show [id]             Preview a saved case',
    '/case edit [id]             Edit feedback or remove captured fields',
    '/case export [id] [md|json] Review, then export locally',
    '/case delete [id]           Delete one saved case (not previous exports)',
    '/case help',
    '',
    'No model calls. No uploads. Only the latest request on the active branch.',
    'Feedback is unverified; inspect exported content before sharing.',
].join('\n');
export default function caseclip(pi) {
    let busy = false;
    pi.registerCommand('case', {
        description: 'CaseClip: save, review and export an agent failure case',
        getArgumentCompletions: prefix => ['save', 'list', 'show', 'edit', 'export', 'delete', 'help']
            .filter(x => x.startsWith(prefix)).map(value => ({ value, label: value })),
        handler: async (args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify('CaseClip requires interactive Pi (/case uses review dialogs).', 'warning');
                return;
            }
            if (busy) {
                ctx.ui.notify('Finish the current CaseClip dialog first.', 'warning');
                return;
            }
            busy = true;
            try {
                await run(args, ctx);
            }
            catch (e) {
                const detail = e.code === 'EEXIST' ? 'Case is locked or already exists. Retry after the other operation finishes.'
                    : e.code === 'ENOENT' ? 'Case was not found. Use /case list.' : e.message;
                ctx.ui.notify(`CaseClip: ${detail}`, 'error');
            }
            finally {
                busy = false;
            }
        },
    });
}
async function review(ctx, card, label) {
    let value = editable(card);
    for (;;) {
        const next = await ctx.ui.editor(`${label} · Enter accepts. Esc cancels. Remove optional fields to exclude them.`, value);
        if (next === undefined)
            return;
        value = next;
        try {
            return applyEdit(card, value);
        }
        catch (e) {
            ctx.ui.notify(`Invalid edit: ${e.message}`, 'error');
        }
    }
}
async function pick(ctx, store, id) {
    if (id)
        return store.load(id);
    const { cards, skipped } = store.list();
    if (skipped)
        ctx.ui.notify(`${skipped} unreadable case file(s) skipped. Files were not modified.`, 'warning');
    if (!cards.length) {
        ctx.ui.notify('No cases in this project. Try /case save <reason>.', 'info');
        return;
    }
    const labels = cards.map(c => `${c.id} · ${c.createdAt.slice(0, 10)} · ${c.title.replace(/\s+/g, ' ')}`);
    const selected = await ctx.ui.select(`CaseClip · ${cards.length} cases`, labels);
    if (selected === undefined)
        return;
    return cards[labels.indexOf(selected)];
}
async function run(args, ctx) {
    const match = args.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
    const command = match?.[1] ?? 'help';
    const rest = match?.[2] ?? '';
    if (command === 'help') {
        await ctx.ui.editor('CaseClip help (read only; edits are ignored)', HELP);
        return;
    }
    if (!['save', 'list', 'show', 'edit', 'export', 'delete'].includes(command))
        throw new Error('Unknown command. Use /case help.');
    const cwd = realpathSync(ctx.cwd);
    const store = new CaseStore(defaultRoot(), projectKey(cwd));
    if (command === 'save') {
        if (!ctx.isIdle() || ctx.hasPendingMessages())
            throw new Error('Wait for the agent and queued messages to finish, then save the case.');
        const reason = rest || await ctx.ui.input('What went wrong? What did you expect?');
        if (!reason?.trim())
            return;
        const session = ctx.sessionManager;
        const card = capture(session.getBranch(), { cwd, sessionId: session.getSessionId(), leafId: session.getLeafId() }, reason);
        const reviewed = await review(ctx, card, 'Review before saving locally');
        if (!reviewed)
            return;
        store.save(reviewed);
        ctx.ui.notify(`Saved ${reviewed.id}. /case list to review.`, 'info');
        return;
    }
    const parts = rest.trim() ? rest.trim().split(/\s+/) : [];
    let format = 'md';
    if (command === 'export' && ['md', 'json'].includes(parts.at(-1) ?? ''))
        format = parts.pop();
    if (parts.length > 1 || (command === 'list' && parts.length))
        throw new Error('Unexpected arguments. Use /case help.');
    const card = await pick(ctx, store, parts[0]);
    if (!card)
        return;
    if (command === 'show') {
        await ctx.ui.editor('Case preview (read only; use /case edit to save edits)', markdown(card));
        return;
    }
    if (command === 'list') {
        const action = await ctx.ui.select(card.title, ['View', 'Edit', 'Export Markdown', 'Export JSON', 'Delete', 'Cancel']);
        if (!action || action === 'Cancel')
            return;
        const route = { View: 'show', Edit: 'edit', 'Export Markdown': 'export', 'Export JSON': 'export', Delete: 'delete' };
        return run(`${route[action]} ${card.id}${action.startsWith('Export') ? action.endsWith('JSON') ? ' json' : ' md' : ''}`, ctx);
    }
    if (command === 'edit') {
        const next = await review(ctx, card, 'Edit saved case');
        if (next) {
            store.update(card, next);
            ctx.ui.notify('Case updated. Existing exports are unchanged.', 'info');
        }
        return;
    }
    if (command === 'delete') {
        if (await ctx.ui.confirm('Delete this case?', `${card.title}\nExisting exported copies and the original Pi session will remain.`)) {
            store.remove(card);
            ctx.ui.notify('Case deleted.', 'info');
        }
        return;
    }
    const next = await review(ctx, card, 'Review export copy (does not change saved case)');
    if (next) {
        const file = store.export(next, format);
        ctx.ui.notify(`Exported locally: ${file}\nNothing uploaded. Review before sharing.`, 'info');
    }
}
