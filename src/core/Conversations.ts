/**
 * Registry of conversation scripts. A script is an async function that drives `ctx.ui.dialogue`.
 *   vendor:<stallId>  → registered by src/dialogue (talk to an artisan, ask questions)
 *   cast:<castId>     → registered by src/story (the guide, the barista…)
 * The core switches the game to 'dialogue' mode, frames the camera and restores everything afterwards.
 */
import type { GameContext } from './contracts';

export type ConversationScript = (ctx: GameContext) => Promise<void>;

export class Conversations {
  private scripts = new Map<string, ConversationScript>();
  private running: string | null = null;
  /** Set by the core: wraps a script with mode/camera handling. */
  runner: ((id: string, script: ConversationScript) => Promise<void>) | null = null;

  register(id: string, script: ConversationScript) {
    this.scripts.set(id, script);
  }

  has(id: string) {
    return this.scripts.has(id);
  }

  get active() {
    return this.running;
  }

  async start(id: string): Promise<void> {
    if (this.running) return;
    const script = this.scripts.get(id);
    if (!script) {
      console.warn(`[givrelune] no conversation registered for "${id}"`);
      return;
    }
    this.running = id;
    try {
      if (this.runner) await this.runner(id, script);
    } catch (err) {
      console.error(`[givrelune] conversation "${id}" failed`, err);
    } finally {
      this.running = null;
    }
  }
}
