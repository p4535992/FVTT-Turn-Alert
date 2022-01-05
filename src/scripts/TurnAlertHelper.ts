import { getGame, TURN_ALERT_MODULE_NAME } from './settings';

export function canUserModifyCombat(combat: StoredDocument<Combat>): boolean {
  if (combat) {
    return combat.canUserModify(<User>getGame().user, 'update');
  } else {
    if (getGame().settings.get(TURN_ALERT_MODULE_NAME, 'allowPlayerToCreateAlerts')) {
      return <boolean>getGame().user?.isGM && <boolean>getGame().user?.active;
    } else {
      return false;
    }
  }
}
