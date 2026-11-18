import type { Product } from "@platform/shared-types";

/** Cards shown under one reply; more than this buries the answer. */
export const MAX_SHOWN_PRODUCTS = 3;

/**
 * Appended to a bot prompt that lists products (numbered 1..n by
 * buildKnowledgePrompt). The search returns every product that's loosely
 * similar to the question; this lets the model say which ones its answer
 * actually recommends, so only those become product cards.
 */
export const PRODUCT_PICK_INSTRUCTION =
  `\n\nAfter your answer, add one final line starting with "SHOW:" followed by the numbers of the products from the list above ` +
  `that your answer recommends or names, most relevant first, at most ${MAX_SHOWN_PRODUCTS} (for example "SHOW: 2, 5"). ` +
  `Write "SHOW: none" when your answer doesn't point to specific products. Don't mention this line anywhere else.`;

// The last "SHOW: …" line, tolerating markdown the model may wrap it in.
const SHOW_LINE = /^[ \t]*[*_`>-]*[ \t]*SHOW[ \t]*:[ \t]*([^\n]*)$/gim;

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Whether the reply names the product: its full title, or most of its distinctive words. */
function mentions(replyWords: Set<string>, replyFlat: string, product: Product): boolean {
  const titleWords = words(product.title);
  if (titleWords.length === 0) return false;
  if (replyFlat.includes(titleWords.join(" "))) return true;
  const distinctive = titleWords.filter((w) => w.length > 2 || /\d/.test(w));
  if (distinctive.length < 2) return false;
  const hits = distinctive.filter((w) => replyWords.has(w)).length;
  return hits / distinctive.length >= 0.75;
}

/**
 * Splits the model's "SHOW:" line off the reply and returns only the products
 * it picked. Without the line (a model that ignored it), falls back to the
 * products the reply names. "SHOW: none" shows no cards.
 */
export function pickShownProducts(reply: string, products: Product[]): { reply: string; products: Product[] } {
  const lines = [...reply.matchAll(SHOW_LINE)];
  const text = reply.replace(SHOW_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
  if (products.length === 0) return { reply: text, products: [] };

  const last = lines.at(-1);
  if (last) {
    const picked: Product[] = [];
    for (const n of last[1].match(/\d+/g) ?? []) {
      const product = products[Number(n) - 1];
      if (product && !picked.includes(product)) picked.push(product);
    }
    return { reply: text, products: picked.slice(0, MAX_SHOWN_PRODUCTS) };
  }

  const replyWordList = words(text);
  const replyWords = new Set(replyWordList);
  const replyFlat = replyWordList.join(" ");
  return { reply: text, products: products.filter((p) => mentions(replyWords, replyFlat, p)).slice(0, MAX_SHOWN_PRODUCTS) };
}
