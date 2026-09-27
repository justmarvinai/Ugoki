'use client';

/**
 * Where the editor's design comes from (docs/05-architecture.md §5, §8): a share link
 * (`#d=`), a draft on this device (`?draft=`), or the template as it comes. Links and drafts
 * are only read here; the render worker sanitizes and migrates what they hold.
 */

import { decodeShare, sharePayload } from '@/lib/share';
import { TEMPLATES, type TemplateEntry } from '@/templates/registry';
import { openDraft } from '../drafts/drafts';

export type StartingDesign = {
  /** A design to load (unsanitized), or none for the template's first Look. */
  state?: unknown;
  draftId: string | null;
  name: string;
  /** Something to tell the user about how the design was opened. */
  notice: string | null;
  /** The user's files the design uses (drafts). */
  files: ReadonlyMap<string, File>;
  /** The template version a share link was made with. */
  linkVersion?: number;
  /** A link for another template: open that editor instead. */
  redirect?: string;
};

const replaceUrl = (url: URL) => window.history.replaceState(window.history.state, '', url);

export async function startingDesign(entry: TemplateEntry): Promise<StartingDesign> {
  const url = new URL(window.location.href);
  const plain = { draftId: null, name: entry.name, notice: null, files: new Map<string, File>() };

  if (url.hash.startsWith('#d=')) {
    const payload = sharePayload(url.hash);
    const shared = payload ? decodeShare(payload) : null;
    // From here on the design is this device's: the link isn't kept in the address bar.
    url.hash = '';
    replaceUrl(url);
    if (!shared) {
      return {
        ...plain,
        notice: 'This link couldn’t be read, so here’s the template as it comes.',
      };
    }
    if (shared.templateId !== entry.id) {
      if (TEMPLATES.some((template) => template.id === shared.templateId)) {
        return { ...plain, redirect: `/editor/${shared.templateId}#d=${payload}` };
      }
      return {
        ...plain,
        notice: 'This link is for a template this version of Ugoki doesn’t have.',
      };
    }
    const notes = ['Opened from a link.'];
    if (shared.imagesLeftOut) notes.push('Images aren’t in links, so placeholders stand in.');
    return {
      ...plain,
      state: shared.state,
      notice: notes.join(' '),
      linkVersion: shared.templateVersion,
    };
  }

  const id = url.searchParams.get('draft');
  if (id) {
    const opened = await openDraft(id);
    if (opened && opened.draft.templateId === entry.id) {
      const missing = [...new Set(Object.values(opened.draft.state.props))].some(
        (value) =>
          (value as { kind?: string } | null)?.kind === 'user' &&
          !opened.files.has((value as { hash: string }).hash),
      );
      return {
        state: opened.draft.state,
        draftId: id,
        name: opened.draft.name,
        notice: missing ? 'Some of this draft’s images are no longer on this device.' : null,
        files: opened.files,
      };
    }
    url.searchParams.delete('draft');
    replaceUrl(url);
    return { ...plain, notice: 'That draft isn’t on this device any more — here’s the template.' };
  }

  return plain;
}
