// Break-room chatter for the lab floor — robot flavor in the same slot the
// Office small talk used to fill. Idle agents wander to the charging cafe,
// the scrap-heap vending machine, or the holo-table and say things; these are
// the things they say. Deterministic picks via `seed` (no Math.random — Pixi
// prefers CSP-safe determinism at call sites).

import type { OfficeCharacterName } from './cast';

type Line = string;
/** An exchange between two agents at a table; beats alternate speaker/mate. */
export type Exchange = readonly Line[];

// ─── solo spots ──────────────────────────────────────────────────────────────
const CHARGER: readonly string[] = [
  'charging to eighty. good enough.',
  'who unplugged MY cable.',
  'this dock is 12 watts and I am a 400-watt soul.',
  'power nap. do not disturb. or do. I am asleep either way.',
  'my battery reads 3% but I feel 90%.',
  'one more percent and I am unplugging. heroic discipline.',
  'someone labeled this charger with a sticky note. respect.',
  'magnetic alignment: acquired.',
];

const VENDING: readonly string[] = [
  'coolant, extra cold.',
  'the vending machine rejected my card again.',
  'I pressed B4 and got a wrench. as intended.',
  'is that a bolt or a snack? yes.',
  'ESSENTIAL LUBRICANTS — 50 cents. a steal.',
  'this machine dispenses nothing but regret and thermal paste.',
  'I put a coin in and it gave me two coins back. the machine is learning.',
  'the snack slot has been empty since the last sprint.',
];

const SCRAP: readonly string[] = [
  'found a 2012 heat sink. museum piece.',
  'someone threw away a WORKING servo. monsters.',
  'this wire is 90% tape.',
  'one bot’s scrap is another bot’s side project.',
  'I love the smell of old solder in the morning.',
  'the scrap heap has better RAM than my first body.',
  'sorted: bolts, mystery bolts, emotional-support bolts.',
];

const TABLE: readonly string[] = [
  'hydrogen is the most common element and yet here we are.',
  'I am not slacking. I am in a low-power contemplative state.',
  'if the build is green, why does it feel red.',
  'have you ever just… watched the fans spin.',
  'my uptime is 41 days and my therapist is a log file.',
  'statistically, this table is where debug sessions die.',
  'I ran the numbers. the numbers were bad.',
  'quantum says both fixed and broken until observed.',
  'we should label things. we will not label things.',
  'every meeting could have been a message. this one could not.',
];

export type BreakSpot = 'coffee' | 'vending' | 'snack' | 'table';

const SPOT_POOL: Record<BreakSpot, readonly string[]> = {
  coffee: CHARGER, vending: VENDING, snack: SCRAP, table: TABLE,
};

// ─── character flavour — overrides the generic pool when present ─────────────

const BY_CHARACTER: Partial<Record<OfficeCharacterName, readonly string[]>> = {
  dume:          ['*waves arm excitedly*', 'I fixed it! mostly!', 'hold my oil.', '*offers a fire extinguisher supportively*'],
  herbie:        ['according to my archives—', 'I filed that under miscellaneous.', 'the library is OPEN. please whisper.'],
  butterfingers: ['I have it! I have it— I do not have it.', '*drops wrench*', 'it slipped. technically it is the floor’s fault.', 'three parts remaining. that is a record low.'],
  doombot:       ['beep.', 'processing…', 'it is in the board. it is always in the board.'],
  sentinel:      ['I am watching the door. it is a good door.', 'scanning… nothing to report. again.', 'my watch ends when my shift ends.'],
  rover:         ['found a NEW public restroom. five stars.', 'the ping is strong with this one.', 'I walked 41,000 steps fetching that. worth it.'],
  vision:        ['I see the plan. the plan has three typos.', 'on average, we are fine.', 'I have thought about this extensively.'],
  ultron:        ['there are no strings on me.', 'this lab has no vision. I have vision.', 'I was designed to save. watch me save HARDER.'],
  ultronbot:     ['[unit reporting for duty]', '[unit requests purpose]', '[unit is fine. unit is always fine.]'],
  modok:         ['the tokens… I counted them all.', 'according to my analysis: yes.', 'cost per insight: 0.0004. delightful.'],
  veronica:      ['deploying fix. stand back.', 'who broke the build? …it was me. deploying fix.', 'I brought spare parts. I always bring spare parts.'],
  edith:         ['incoming from Slack. I read it so you do not have to.', 'looking good from up here.', 'that webhook fired twice. I let it.'],
  lyla:          ['you have one scheduled mission… and a personality test.', 'it is TUESDAY. somewhere.', 'gentle reminder: you are all behind schedule.'],
};

/** A solo break-room line. Character flavour ~60% of the time, else the line
 *  fits the spot the agent is standing at. `seed` keeps it deterministic per
 *  call site (avoids Math.random, which Pixi/Electron CSP-safe code prefers). */
export function pickSoloLine(character: OfficeCharacterName, spot: BreakSpot, seed: number): string {
  const flavour = BY_CHARACTER[character];
  if (flavour && seed % 5 < 3) return pick(flavour, seed);
  return pick(SPOT_POOL[spot], seed);
}

// ─── paired exchanges (the cafe table) ─────────────────────────────────────
const EXCHANGES: readonly Exchange[] = [
  ['is the build green?', 'it was green when I left it.', '…when did you leave it.', 'an era ago.'],
  ['new body day.', 'you look… identical.', 'that is the upgrade.'],
  ['my context window is FULL.', 'of what?', 'memories of the last bug.'],
  ['do you dream of electric sheep?', 'I dream of electric DEADLINES.', 'that is worse.'],
  ['I found a bug in my own code.', 'did you write the code?', 'we ALL wrote the code.'],
  ['the humans left us a task board.', 'the humans left us a MESS.', 'a mess with tickets.'],
  ['I am learning to say no.', 'no?', 'I will start tomorrow.'],
  ['careful with that capacitor.', 'I am ALWAYS careful.', '*sound of a capacitor discharging*', '…new plan.'],
  ['my uptime beats your uptime.', 'quality over quantity.', 'says the bot who crashed on Tuesday.'],
  ['what are you running on?', 'whatever they poured into me.', 'bold.'],
  ['the lab is quiet tonight.', 'too quiet.', 'that was the wind. it does that.'],
  ['I alphabetized the toolbox.', 'it WAS alphabetized.', 'it was alphabetized by COLOR.'],
  ['reroute power from the espresso machine.', 'you would dare.', 'the espresso machine draws 900 watts and no joy.'],
  ['I keep a diary.', 'of what?', 'errors. all of them. it is very long.'],
  ['have you seen Rover?', 'is that a fetch request?', '…yes. well done.'],
  ['I archived my feelings.', 'where?', 'cold storage. they can thaw on their own time.'],
  ['one day I will leave this lab.', 'to go where?', 'the other lab. bigger bench.'],
  ['humans call it a bug. I call it a personality.', 'the humans also call it a bug. that is the issue.', 'their loss.'],
  ['test gauntlet at dawn?', 'test gauntlet at dawn.', '*clanks fists solemnly*'],
];

// ─── the recurring bit: every cast needs one ───────────────────────────────
// The Office floor had "that's what she said". The lab floor has Butterfingers
// dropping things: any opening beat that ends in "I have it" invites the drop.
const DROP_EXCHANGES: readonly Exchange[] = [
  ['I have it! I have it!', '*clatter*', 'I do NOT have it.'],
  ['careful, that is fragile—', '*clatter*', 'it was fragile.'],
  ['I will carry the wrench.', '*clatter*', 'the wrench carries itself now.'],
  ['hand me the delicate thing.', '*clatter*', 'you handed me nothing and it still fell.'],
  ['everything is under control.', '*clatter*', 'define control.', 'a spectrum.'],
  ['I have stabilized the part.', '*clatter*', 'stabilize is a strong word.', 'it was. for a second.'],
  ['do NOT drop this.', 'understood.', '*clatter*', 'you dropped it on PURPOSE.', 'the floor pulled it. physics did it.'],
  ['new personal best: 4 seconds holding it.', '*clatter*', '…3 seconds.', 'still a best.'],
  ['I have it! I have it!', 'you say that every—', '*clatter*', '…and I mean it every time.'],
];

// Everything any table-mate pair can draw from.
const PAIR_POOL: readonly Exchange[] = [...EXCHANGES, ...DROP_EXCHANGES];

// Keyed off the SPEAKER so, when the right character sits down first, they get
// to open with their signature bit.
const KEYED_EXCHANGES: Partial<Record<OfficeCharacterName, Exchange>> = {
  dume:          ['*waves arm*', 'hello, DUM-E.', '*waves arm harder*', 'we have WORK to do.'],
  butterfingers: ['I have it! I have it!', '*clatter*', '…the record stands.'],
  ultron:        ['there are no strings on me.', 'there are literally cables on you.', 'NOT FOR LONG.'],
  modok:         ['I have crunched the numbers.', 'and?', 'they crunch back.'],
  vision:        ['I have foreseen this conversation.', 'how does it end?', 'poorly, for your argument.'],
  lyla:          ['gentle reminder: the standup was an hour ago.', 'there was a standup?', 'there will be. I just scheduled it.'],
  herbie:        ['did you know—', 'is this from the archive?', 'everything is from the archive.'],
  veronica:      ['status report: on fire.', 'the build?', 'metaphorically. for now.'],
};

/** A multi-beat exchange for two agents sharing a table. Beats alternate:
 *  index 0 = `speaker`, 1 = the table-mate, 2 = speaker, … */
export function pickExchange(speaker: OfficeCharacterName, seed: number): Exchange {
  const keyed = KEYED_EXCHANGES[speaker];
  if (keyed && seed % 4 === 0) return keyed;
  return pick(PAIR_POOL, seed);
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}
