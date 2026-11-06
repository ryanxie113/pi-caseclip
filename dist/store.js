import { mkdirSync, lstatSync, openSync, readFileSync, writeFileSync, closeSync, renameSync, unlinkSync, readdirSync, constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ID_PATTERN, validateCard, markdown } from './core.js';
export function defaultRoot() {
    const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
    return resolve(process.env.CASECLIP_DIR || join(agentDir.replace(/^~(?=\/)/, homedir()), 'caseclip'));
}
export class CaseStore {
    root;
    project;
    dir;
    constructor(root, project) {
        this.root = root;
        this.project = project;
        if (!/^[a-f0-9]{24}$/.test(project))
            throw new Error('Invalid project key.');
        this.dir = join(root, project);
    }
    ensure() {
        for (const dir of [this.root, this.dir]) {
            mkdirSync(dir, { recursive: true, mode: 0o700 });
            if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory())
                throw new Error('Case storage must be a real directory.');
        }
    }
    path(id) {
        if (!ID_PATTERN.test(id))
            throw new Error('Invalid case ID. Use /case list to select a case.');
        return join(this.dir, `${id}.json`);
    }
    load(id) {
        const path = this.path(id);
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const card = JSON.parse(readFileSync(fd, 'utf8'));
            validateCard(card);
            if (card.id !== id || card.projectKey !== this.project)
                throw new Error('Case identity does not match its storage location.');
            return card;
        }
        finally {
            closeSync(fd);
        }
    }
    list() {
        let names;
        try {
            names = readdirSync(this.dir);
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return { cards: [], skipped: 0 };
            throw e;
        }
        const cards = [];
        let skipped = 0;
        for (const file of names.filter(n => n.endsWith('.json'))) {
            try {
                cards.push(this.load(file.slice(0, -5)));
            }
            catch {
                skipped++;
            }
        }
        return { cards: cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), skipped };
    }
    save(card) {
        validateCard(card);
        if (card.projectKey !== this.project)
            throw new Error('Project mismatch.');
        this.ensure();
        const path = this.path(card.id);
        writeFileSync(path, JSON.stringify(card, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        return path;
    }
    change(original, action) {
        this.ensure();
        const lock = this.path(original.id) + '.lock';
        const fd = openSync(lock, 'wx', 0o600);
        try {
            if (JSON.stringify(this.load(original.id)) !== JSON.stringify(original))
                throw new Error('Case changed in another session. Reopen it before editing.');
            action();
        }
        finally {
            closeSync(fd);
            unlinkSync(lock);
        }
    }
    update(original, next) {
        validateCard(next);
        if (next.id !== original.id || next.projectKey !== this.project || next.createdAt !== original.createdAt)
            throw new Error('Cannot change case identity.');
        this.change(original, () => {
            const temp = this.path(original.id) + `.${randomUUID()}.tmp`;
            try {
                writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
                renameSync(temp, this.path(original.id));
            }
            finally {
                try {
                    unlinkSync(temp);
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                }
            }
        });
    }
    remove(original) {
        this.change(original, () => unlinkSync(this.path(original.id)));
    }
    export(card, format) {
        validateCard(card);
        if (card.projectKey !== this.project)
            throw new Error('Project mismatch.');
        this.ensure();
        const dir = join(this.dir, 'exports');
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        if (lstatSync(dir).isSymbolicLink())
            throw new Error('Export directory cannot be a symlink.');
        const file = join(dir, `${card.id}-${randomUUID().slice(0, 8)}.${format}`);
        writeFileSync(file, format === 'md' ? markdown(card) : JSON.stringify(card, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        return file;
    }
}
