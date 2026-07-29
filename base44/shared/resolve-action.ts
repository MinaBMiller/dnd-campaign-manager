import { rollFormula, rollDice, RollMode } from "./dice.ts";

const ECONOMY_SLOT: Record<string, "action" | "bonus_action" | "reaction" | null> = {
  attack: "action",
  spell: "action",
  item_use: "bonus_action",
  move: null,
  skill_check: null,
  dialogue: null,
  end_turn: null,
};

function entityHandlerFor(base44: any, type: "character" | "npc") {
  return type === "character" ? base44.asServiceRole.entities.Character : base44.asServiceRole.entities.NPC;
}

async function recordRoll(base44: any, action: any, actorLabel: string, purpose: string, formula: string, mode: RollMode) {
  const roll = rollFormula(formula, mode);
  await base44.asServiceRole.entities.DiceRoll.create({
    campaign_id: action.campaign_id,
    dm_email: action.dm_email,
    party_emails: action.party_emails ?? [],
    actor_id: action.actor_id,
    actor_label: actorLabel,
    roll_purpose: purpose,
    formula,
    mode,
    dice_results: roll.dice_results,
    modifier: roll.modifier,
    total: roll.total,
    is_critical: roll.is_critical,
    is_fumble: roll.is_fumble,
  });
  return roll;
}

async function advanceTurn(base44: any, encounter: any) {
  const order = encounter.turn_order ?? [];
  if (order.length === 0) return { round_number: encounter.round_number, current_turn_index: encounter.current_turn_index };

  let nextIndex = encounter.current_turn_index + 1;
  let round = encounter.round_number;
  let resetOrder = order;

  if (nextIndex >= order.length) {
    nextIndex = 0;
    round += 1;
    resetOrder = order.map((p: any) => ({ ...p, action_used: false, bonus_action_used: false, reaction_used: false }));
  }

  await base44.asServiceRole.entities.Encounter.update(encounter.id, {
    current_turn_index: nextIndex,
    round_number: round,
    turn_order: resetOrder,
  });

  return { round_number: round, current_turn_index: nextIndex };
}

/** Resolves a pending Action: rolls dice, applies HP/condition effects, advances the
 * encounter's turn order, logs the outcome, and marks the action resolved. Shared by
 * the submit-action and resolve-action functions so both go through one code path. */
export async function resolveAction(base44: any, actionId: string) {
  const action = await base44.asServiceRole.entities.Action.get(actionId);
  if (!action) throw new Error(`Action not found: ${actionId}`);
  if (action.status !== "pending") {
    return action; // already resolved/rejected — idempotent no-op
  }

  const actorHandler = entityHandlerFor(base44, action.actor_type);
  const actor = await actorHandler.get(action.actor_id);
  const actorLabel = actor?.name ?? action.actor_id;

  const result: Record<string, unknown> = {};
  let logContent = `${actorLabel} `;

  if (action.action_kind === "attack" || action.action_kind === "spell") {
    const attackBonus = Number(action.payload?.attack_bonus ?? 0);
    const attackRoll = await recordRoll(base44, action, actorLabel, `${action.action_kind} roll`, `1d20+${attackBonus}`, "normal");

    let targetAc = 10;
    let targetHandler: any = null;
    let target: any = null;
    if (action.target_id && action.target_type) {
      targetHandler = entityHandlerFor(base44, action.target_type);
      target = await targetHandler.get(action.target_id);
      targetAc = target?.ac ?? 10;
    }

    const hit = attackRoll.is_critical || (!attackRoll.is_fumble && attackRoll.total >= targetAc);
    result.attack_roll = attackRoll;
    result.hit = hit;

    if (hit && target) {
      const damageFormula = String(action.payload?.damage_formula ?? "1d6");
      const damageRoll = await recordRoll(base44, action, actorLabel, `${action.action_kind} damage`, damageFormula, "normal");
      const damage = attackRoll.is_critical ? damageRoll.total * 2 : damageRoll.total;
      const newHp = Math.max(0, (target.hp_current ?? 0) - damage);
      await targetHandler.update(target.id, { hp_current: newHp, is_alive: newHp > 0 });
      result.damage_roll = damageRoll;
      result.damage_dealt = damage;
      result.target_hp_remaining = newHp;
      logContent += `${attackRoll.is_critical ? "critically hits" : "hits"} ${target.name} for ${damage} damage (${newHp} HP left).`;
    } else {
      logContent += `attacks and misses.`;
    }
  } else if (action.action_kind === "skill_check") {
    const checkBonus = Number(action.payload?.check_bonus ?? 0);
    const dc = Number(action.payload?.dc ?? 10);
    const mode: RollMode = action.payload?.mode === "advantage" || action.payload?.mode === "disadvantage" ? action.payload.mode : "normal";
    const checkRoll = await recordRoll(base44, action, actorLabel, String(action.payload?.skill ?? "skill check"), `1d20+${checkBonus}`, mode);
    const success = checkRoll.total >= dc;
    result.check_roll = checkRoll;
    result.dc = dc;
    result.success = success;
    logContent += `attempts a ${action.payload?.skill ?? "check"} (DC ${dc}): ${success ? "success" : "failure"} (${checkRoll.total}).`;
  } else if (action.action_kind === "move") {
    result.destination = action.payload?.destination ?? null;
    logContent += `moves${action.payload?.destination ? ` to ${action.payload.destination}` : "."}`;
  } else if (action.action_kind === "item_use") {
    result.item_id = action.payload?.item_id ?? null;
    logContent += `uses an item.`;
  } else if (action.action_kind === "dialogue") {
    result.line = action.payload?.line ?? "";
    logContent += `says: "${action.payload?.line ?? ""}"`;
  } else if (action.action_kind === "end_turn") {
    logContent += `ends their turn.`;
  }

  // Advance action economy / turn order if this action belongs to an active encounter.
  if (action.encounter_id) {
    const encounter = await base44.asServiceRole.entities.Encounter.get(action.encounter_id);
    if (encounter && encounter.status === "active") {
      const slot = ECONOMY_SLOT[action.action_kind];
      if (slot) {
        const turn_order = (encounter.turn_order ?? []).map((p: any) =>
          p.participant_id === action.actor_id ? { ...p, [`${slot}_used`]: true } : p
        );
        await base44.asServiceRole.entities.Encounter.update(encounter.id, { turn_order });
      }
      if (action.action_kind === "end_turn") {
        await advanceTurn(base44, await base44.asServiceRole.entities.Encounter.get(encounter.id));
      }
    }
  }

  await base44.asServiceRole.entities.LogEntry.create({
    campaign_id: action.campaign_id,
    dm_email: action.dm_email,
    party_emails: action.party_emails ?? [],
    entry_type: "combat",
    author_label: actorLabel,
    content: logContent,
    related_action_id: action.id,
  });

  const resolved = await base44.asServiceRole.entities.Action.update(action.id, {
    status: "resolved",
    result,
    resolved_date: new Date().toISOString(),
  });

  return resolved;
}
