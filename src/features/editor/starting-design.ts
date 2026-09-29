'use client';

/**
 * Where the editor's design comes from (docs/05-architecture.md §5, §8): a share link
 * (`#d=`), a draft on this device (`?draft=`), or the template as it comes — with the gallery's
 * choices when a tile opened it (`?headline=`, `?format=`, `?look=`; docs/02-experience.md §3,
 * flow A). Links, drafts and choices are only read here; the render worker sanitizes and
 * migrates what they hold.
 */

import {
  type DesignState,
  FORMAT_IDS,
  type FormatId,
  primaryTextKey,
  type TemplateDescriptor,
} from '@/engine/host';
import { decodeShare, sharePayload } from '@/lib/share';
import { TEMPLATES, type TemplateEntry } from '@/templates/registry';
import { openDraft } from '../drafts/drafts';

/** The gallery's choices carried into the editor. */
export type GalleryChoices = {
  /** Personalization text, for the template's primary text control. */
  headline?: string;
  format?: FormatId;
};

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
  /** The Look to start from, when there's no design to load (a gallery link). */
  look?: number;
  /** Applied to the template's first state, then sanitized with it (a gallery link). */
  choices?: GalleryChoices;
};

const GALLERY_PARAMS = ['headline', 'format', 'look'] as const;

/** The gallery's choices in the address bar, taken out of it (they are this visit's only). */
function takeGalleryChoices(
  url: URL,
  entry: TemplateEntry,
): { look?: number; choices?: GalleryChoices } | null {
  const params = url.searchParams;
  if (!GALLERY_PARAMS.some((name) => params.has(name))) return null;
  const headline = params.get('headline')?.trim().slice(0, 500);
  const format = params.get('format')?.replace('x', ':');
  const look = Number(params.get('look'));
  for (const name of GALLERY_PARAMS) params.delete(name);
  const choices: GalleryChoices = {
    ...(headline ? { headline } : {}),
    ...((FORMAT_IDS as readonly string[]).includes(format ?? '') &&
    entry.formats.includes(format as FormatId)
      ? { format: format as FormatId }
      : {}),
  };
  return {
    ...(Number.isInteger(look) && look > 0 ? { look } : {}),
    ...(Object.keys(choices).length > 0 ? { choices } : {}),
  };
}

/**
 * A template's first state with the gallery's choices: its format (when the template has it)
 * and the headline in its primary text control. The editor has the worker sanitize the result.
 */
export function withGalleryChoices(
  state: DesignState,
  template: TemplateDescriptor,
  choices: GalleryChoices,
): DesignState {
  const key = primaryTextKey(template.controls);
  const format =
    choices.format && template.formats.includes(choices.format) ? choices.format : state.format;
  return {
    ...state,
    format,
    props: choices.headline && key ? { ...state.props, [key]: choices.headline } : state.props,
  };
}

const replaceUrl = (url: URL) => window.history.replaceState(window.history.state, '', url);

export async function startingDesign(entry: TemplateEntry): Promise<StartingDesign> {
  const url = new URL(window.location.href);
  const plain = { draftId: null, name: entry.name, notice: null, files: new Map<string, File>() };
  // Read once, then out of the address bar (like a share link), whatever else opens.
  const gallery = takeGalleryChoices(url, entry);
  if (gallery) replaceUrl(url);

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

  return { ...plain, ...gallery };
}

/** The format a gallery link asks for (valid for the template), read before it's taken out. */
export function requestedFormat(entry: TemplateEntry): FormatId | null {
  const params = new URLSearchParams(window.location.search);
  if (params.has('draft') || window.location.hash.startsWith('#d=')) return null;
  const format = params.get('format')?.replace('x', ':');
  return entry.formats.find((id) => id === format) ?? null;
}
