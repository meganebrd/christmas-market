/**
 * Dialogue module: talk with the artisans, WITHOUT any AI.
 *
 *  - registerVendorConversations(ctx): registers `vendor:<stallId>` on ctx.conversations for every stall.
 *  - createResponder(stall): the question answering engine (French-aware BM25 + intents + persona),
 *    pure TypeScript, also usable by the editor ("test your stall") and the tests.
 */
import type { GameContext } from '../core/contracts';
import { vendorScript } from './conversation';

export function registerVendorConversations(ctx: GameContext): void {
  for (const stall of ctx.config.stalls) {
    ctx.conversations.register(`vendor:${stall.id}`, vendorScript(stall.id, stall));
  }
}

export { createResponder, type Answer, type Responder, type ResponderOptions, type Emotion } from './responder';
export { vendorScript, responderFor, productCard, linkCard, VENDOR_CHOICES } from './conversation';
export { normalize, tokenize, stem, splitSentences } from './normalize';
export { detectIntents, detectSmalltalk, type IntentId, type SmalltalkKind } from './intents';
