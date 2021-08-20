import TurnAlertConfig from './TurnAlertConfig';
import TurnAlert from '../TurnAlert';
import { getGame, TURN_ALERT_FLAG_ALERTS, TURN_ALERT_MODULE_NAME } from '../settings';
import { i18n, i18nFormat } from '../../turn-alert';
import { CombatantData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/module.mjs';

/**
 * Provides an interface to view, add, update, and delete alerts on a given combat.
 * @param {string} data.combatId The id of the combat to display.
 */
export default class CombatAlertsApplication extends Application {
  combatId: string;
  _combat: Combat;
  _updateHandler: any;

  constructor(data, options?) {
    super(options);

    this.combatId = data.combatId;
    this._combat = <Combat>(<CombatEncounters>getGame().combats).get(this.combatId);
    if (!this._combat) {
      throw new Error(`The given combatID (${data.combatId}) is not valid.`);
    }
    this._updateHandler = this._onCombatUpdate.bind(this);

    Hooks.on('updateCombat', this._updateHandler);
    Hooks.on('deleteCombat', this.close.bind(this));
  }

  /**
   * A handler called each time the combat associated with this instance changes.
   */
  _onCombatUpdate(combat, changed, options, userId) {
    if (combat.data.id === this.combatId && changed.active === false) {
      this.close();
    } else {
      this.render(false);
    }
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: `/modules/${TURN_ALERT_MODULE_NAME}/templates/combat-alerts.hbs`,
      title: i18n(`${TURN_ALERT_MODULE_NAME}.APP.CombatAlertsTitle`),
      width: 650,
      height: 650,
      resizable: true,
    });
  }

  /** @override */
  getData(options) {
    return {
      // Prepend the turn list with the "Top of Round" pseudo-turn
      turns: [
        {
          index: -1,
          id: null,
          img: null,
          name: i18n(`${TURN_ALERT_MODULE_NAME}.APP.TopOfRound`),
          initiative: null,
          isVisible: <boolean>getGame().user?.isGM,
          alerts: this._alertsForTurn(null).map(this._createAlertDisplayData.bind(this)),
        },
      ]
        .concat(this._turnData())
        .filter((turn) => turn.isVisible),
      currentRound: this._combat.data.round,
      currentTurn: this._combat.data.turn + 1,
      currentInitiative: this._combat.turns[this._combat.data.turn]?.initiative,
    };
  }

  /** Prepares and gets the relevant data for each turn in the combat. */
  _turnData(): any[] {
    return this._combat.turns.map((turn, index) => ({
      index,
      id: <string>turn.id,
      img: <string>turn.img,
      name: <string>turn.name,
      initiative: <number>turn.initiative,
      isVisible: <boolean>(turn.isOwner && turn.visible && !turn.hidden),
      alerts: <TurnAlert[]>this._alertsForTurn(turn.id)
        .map(this._createAlertDisplayData.bind(this))
        .filter((alertTmp: any) => alertTmp.isVisible),
    }));
  }

  /** Produces the data required by the view for the given alert */
  _createAlertDisplayData(alertTmp: TurnAlert) {
    const nextTrigger = TurnAlert.nextTriggerRound(alertTmp, this._combat.data.round, this._combat.data.turn);
    const repeatString =
      <number>alertTmp.repeating?.frequency > 1
        ? i18nFormat(`${TURN_ALERT_MODULE_NAME}.APP.RepeatEveryNRounds`, {
            num: alertTmp.repeating?.frequency,
          })
        : i18n(`${TURN_ALERT_MODULE_NAME}.APP.RepeatEveryOneRound`);

    const roundTitle = alertTmp.endOfTurn
      ? `${TURN_ALERT_MODULE_NAME}.APP.TriggerAtEndOfTurnNum`
      : `${TURN_ALERT_MODULE_NAME}.APP.TriggerAtStartOfTurnNum`;
    const roundIcon = alertTmp.endOfTurn ? 'hourglass-end' : 'hourglass-start';

    const macroName = (
      getGame().macros?.get(<string>alertTmp.macro) || getGame().macros?.getName(<string>alertTmp.macro)
    )?.data?.name;

    return {
      id: alertTmp.id,
      label: alertTmp.label,
      message: alertTmp.message,
      recipientNames: alertTmp.recipientIds.map((id) => getGame().users?.get(id)?.data.name).join(', '),
      repeating: alertTmp.repeating,
      round: nextTrigger,
      isVisible: getGame().user?.isGM || getGame().userId == alertTmp.userId,
      repeatString,
      roundTitle,
      roundIcon,
      macroName,
    };
  }

  /**
   * Gets all of the alerts associated with a particular turn
   * @param {string} turnId The turn id to get alerts for
   */
  _alertsForTurn(turnId) {
    const alerts = <TurnAlert[]>this._combat.getFlag(TURN_ALERT_MODULE_NAME, TURN_ALERT_FLAG_ALERTS);
    if (!alerts) {
      return [];
    }
    //@ts-ignore
    return Object.values(alerts).filter((alertTmp) => alertTmp.turnId === turnId);
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.unshift({
      icon: 'fas fa-info-circle',
      class: 'icon',
      label: '',
      onclick: async (event) => {
        window.open('https://github.com/schultzcole/FVTT-Turn-Alert/wiki/User-Guide#combat-alerts-window');
      },
    });

    return buttons;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Set minimum width of the containing application window.
    html.parent().parent().css('min-width', 300);

    // Listen for "delete all" button to be clicked.
    html.find('#cn-delete-all').click((event) => {
      this._combat.unsetFlag(TURN_ALERT_MODULE_NAME, TURN_ALERT_FLAG_ALERTS);
    });

    // Listen for alert add buttons to be clicked.
    html.find('.add-alert-button').click((event) => {
      const alertData = TurnAlert.defaultData;
      (alertData.combatId = this.combatId),
        (alertData.createdRound = this._combat.data.round),
        (alertData.round = 1),
        (alertData.turnId = event.currentTarget.dataset.turnid || null),
        new TurnAlertConfig(alertData, {}).render(true);
    });

    // Listen for alert edit buttons to be clicked.
    html.find('.edit-alert-button').click((event) => {
      const alertId = event.currentTarget.dataset.id;
      const alertData = <TurnAlert>this._combat.getFlag(TURN_ALERT_MODULE_NAME, `alerts.${alertId}`); //getProperty(this._combat.data, `flags.${TURN_ALERT_MODULE_NAME}.alerts.${alertId}`);
      if (!alertData) {
        throw new Error(
          `Trying to edit a non-existent turn alert! ID "${alertId}" does not exist on combat "${this.combatId}"`,
        );
      }
      new TurnAlertConfig(alertData, {}).render(true);
    });

    // Listen for alert delete buttons to be clicked.
    html.find('.delete-alert-button').click((event) => {
      TurnAlert.delete(this.combatId, event.currentTarget.dataset.id);
    });
  }

  /** @override */
  async close() {
    // Unregister the combat update handler.
    Hooks.off('updateCombat', this._updateHandler);
    return super.close();
  }
}
