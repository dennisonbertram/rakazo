import { useEffect } from "react";

/** Marks a list item that takes part in the roving tabindex. */
export const ROVING_ITEM = "[data-roving]";
/** Marks a secondary control (a row's Actions button). Reached from its item with ArrowRight. */
export const ROVING_ACTION = "[data-roving-action]";

/**
 * Makes everything marked `data-roving` inside `root` a single tab stop (the WAI-ARIA "roving
 * tabindex"): Tab enters and leaves the list once, ArrowUp/ArrowDown/Home/End move between items.
 * ArrowRight moves from an item to the `data-roving-action` control next to it; ArrowLeft or Escape
 * moves back. Alt/Ctrl/Meta/Shift combinations are left alone (Alt+Arrow reorders rows).
 *
 * Pass the element from a callback ref held in state (`ref={setEl}`), so a list that mounts later is
 * picked up. It works on the DOM, so items that mount later are picked up by a MutationObserver. Give the
 * action controls `tabIndex={-1}` in markup; the hook only manages the items.
 */
export function useRovingTabindex(
  root: HTMLElement | null,
  /** Which item is the tab stop until the user focuses one. Default: the current page, else first. */
  initial: "first" | "last" = "first",
) {
  useEffect(() => {
    if (!root) return;
    let active: HTMLElement | null = null;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(ROVING_ITEM));

    const sync = () => {
      const list = items();
      if (!active || !list.includes(active)) {
        active =
          list.find((el) => el.hasAttribute("aria-current")) ??
          (initial === "last" ? list[list.length - 1] : list[0]) ??
          null;
      }
      for (const el of list) {
        const value = el === active ? "0" : "-1";
        if (el.getAttribute("tabindex") !== value) el.setAttribute("tabindex", value);
      }
    };

    /** The item an action belongs to: the first item in its nearest ancestor that has one. */
    const ownerOf = (action: HTMLElement) => {
      for (let node = action.parentElement; node && node !== root; node = node.parentElement) {
        const item = node.querySelector<HTMLElement>(ROVING_ITEM);
        if (item) return item;
      }
      return null;
    };
    /** The actions next to an item, looking up only as far as the item's own wrapper. */
    const actionsOf = (item: HTMLElement) => {
      for (let node = item.parentElement; node && node !== root; node = node.parentElement) {
        if (node.querySelectorAll(ROVING_ITEM).length > 1) return [];
        const actions = Array.from(node.querySelectorAll<HTMLElement>(ROVING_ACTION));
        if (actions.length > 0) return actions;
      }
      return [];
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      const item = target.matches(ROVING_ACTION) ? ownerOf(target) : target.closest(ROVING_ITEM);
      if (item && item !== active) {
        active = item as HTMLElement;
        sync();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      const rtl = getComputedStyle(root).direction === "rtl";
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (target.matches(ROVING_ACTION)) {
        const owner = ownerOf(target);
        if (!owner) return;
        const actions = actionsOf(owner);
        const at = actions.indexOf(target);
        let next: HTMLElement | undefined;
        if (event.key === forward) next = actions[at + 1];
        else if (event.key === back) next = actions[at - 1] ?? owner;
        else if (event.key === "Escape") next = owner;
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        next.focus();
        return;
      }
      if (!target.matches(ROVING_ITEM)) return;
      if (event.key === forward) {
        const action = actionsOf(target)[0];
        if (!action) return;
        event.preventDefault();
        action.focus();
        return;
      }
      const list = items();
      const index = list.indexOf(target);
      const next =
        event.key === "ArrowDown"
          ? list[Math.min(index + 1, list.length - 1)]
          : event.key === "ArrowUp"
            ? list[Math.max(index - 1, 0)]
            : event.key === "Home"
              ? list[0]
              : event.key === "End"
                ? list[list.length - 1]
                : null;
      if (!next) return;
      event.preventDefault();
      next.focus();
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current"],
    });
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [root, initial]);
}
