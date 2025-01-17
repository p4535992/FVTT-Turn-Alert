import { getGame, TURN_ALERT_FLAG_ALERTS, TURN_ALERT_MODULE_NAME } from './settings';
import TurnAlert from './TurnAlert';
import { compareTurns } from './utils';

export async function handlePreUpdateCombat(combat, changed, options, userId) {
  if (!('round' in changed || 'turn' in changed) || !combat.turns?.length) {
    return true;
  }

  options.prevRound = combat.data.round;
  options.prevTurn = combat.data.turn;
}

export async function handleUpdateCombat(combat, changed, options, userId) {
  if (!('round' in changed || 'turn' in changed) || !combat.turns?.length) {
    return;
  }

  let alerts = <TurnAlert[]>combat.getFlag(TURN_ALERT_MODULE_NAME, TURN_ALERT_FLAG_ALERTS);
  if (!alerts) {
    return;
  }
  alerts = <TurnAlert[]>foundry.utils.deepClone(alerts);

  const prevRound = options.prevRound;
  const prevTurn = options.prevTurn;
  const nextRound = 'round' in changed ? changed.round : prevRound;
  const nextTurn = 'turn' in changed ? changed.turn : prevTurn;

  if (compareTurns(prevRound, prevTurn, nextRound, nextTurn) > 0) {
    return;
  }
  let anyDeleted = false;
  for (let id in alerts) {
    const alert = alerts[id];

    if (getGame().userId === alert.userId && TurnAlert.checkTrigger(alert, nextRound, nextTurn, prevRound, prevTurn)) {
      TurnAlert.execute(alert);
    }

    if (getGame().user?.isGM && TurnAlert.checkExpired(alert, nextRound, nextTurn, prevRound, prevTurn)) {
      delete alerts[id];
      anyDeleted = true;
    }
  }

  const firstGm = getGame().users?.find((u) => u.isGM && u.active);
  if (firstGm && getGame().user === firstGm && anyDeleted) {
    await combat.unsetFlag(TURN_ALERT_MODULE_NAME, TURN_ALERT_FLAG_ALERTS);
    if (Object.keys(alerts).length > 0) {
      combat.setFlag(TURN_ALERT_MODULE_NAME, TURN_ALERT_FLAG_ALERTS, alerts);
    }
  }
}
