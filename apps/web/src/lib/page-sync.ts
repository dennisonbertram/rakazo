/** A remote change replaces the page only when the user has nothing unsaved. */
export function resolveRemotePage({ dirty }: { dirty: boolean }): "reload" | "offer" {
  return dirty ? "offer" : "reload";
}
