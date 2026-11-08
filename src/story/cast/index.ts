import type { GameContext } from '../../core/contracts';
import type { CastConfig, StoryRuntime } from '../types';
import type { CastEnv } from './common';
import { guideScript } from './guide';
import { baristaScript } from './barista';
import { hasKeeperScript, keeperScript } from './keepers';
import { chestnutScript, musicianScript, villagerScript } from './others';

/** Registers `cast:<id>` conversations for every cast member, by role. Returns the ids. */
export function registerCast(ctx: GameContext, story: StoryRuntime): string[] {
  const ids: string[] = [];
  for (const m of ctx.config.cast) {
    const id = 'cast:' + m.id;
    const run = pick(m);
    ctx.conversations.register(id, async (c) => {
      const env: CastEnv = { ctx: c, story, m, d: c.ui.dialogue };
      await run(env);
    });
    ids.push(id);
  }
  return ids;
}

function pick(m: CastConfig): (env: CastEnv) => Promise<void> {
  switch (m.role) {
    case 'guide':
      return guideScript;
    case 'barista':
      return baristaScript;
    case 'chestnut-seller':
      return chestnutScript;
    case 'musician':
      return musicianScript;
    default:
      return hasKeeperScript(m.role) ? keeperScript : villagerScript;
  }
}
