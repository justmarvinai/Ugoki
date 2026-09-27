/**
 * Files headed for an image field from elsewhere in the editor — dropped on the stage or pasted
 * — so they're read by the field itself, which shows how it went in its status line.
 */

/** Reads a file into its field; resolves to an error message, or null when it's in. */
export type ReceiveFile = (file: File) => Promise<string | null>;

export type FileInbox = {
  /** Hands `file` to the field of `control`; null when no such field is showing. */
  send(control: string, file: File): Promise<string | null> | null;
  /** Registers the field of `control`; returns the function that unregisters it. */
  listen(control: string, receive: ReceiveFile): () => void;
  /** Notes the image field the user is working in (pointer or focus inside it). */
  touch(control: string): void;
  /** The image field the user last worked in, if it's still showing. */
  readonly active: string | null;
};

export function createFileInbox(): FileInbox {
  const fields = new Map<string, ReceiveFile>();
  let active: string | null = null;
  return {
    send: (control, file) => fields.get(control)?.(file) ?? null,
    listen(control, receive) {
      fields.set(control, receive);
      return () => {
        if (fields.get(control) === receive) fields.delete(control);
      };
    },
    touch(control) {
      active = control;
    },
    get active() {
      return active !== null && fields.has(active) ? active : null;
    },
  };
}
