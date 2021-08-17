import { error, log } from "../turn-alert.js";
import { getCanvas, getGame, TURN_ALERT_MODULE_NAME, TURN_ALERT_SOCKET_NAME } from "./settings.js";
import { TurnAlertRepeating } from "./TurnAlertModels.js";
import { compareTurns } from "./utils.js";

/**
 * Data structure schema:
 * {
 *     id: id string,                        // The 16 char (allegedly) unique ID for this alert
 *     name: string                          // A human readable, identifier that may be specified for programmatically created alerts and used to find them later.
 *     combatId: id string,                  // The id of the combat that this turn alert belongs to
 *     createdRound: integer                 // The combat round during which this alert was created
 *     round: integer,                       // The round that this turn alert will activate on
 *     roundAbsolute: boolean,               // Whether the round number is absolute (i.e. the alert happens on round 5) or relative to the round during which the alert was created (i.e. the alert happens 5 rounds after creation)
 *     turnId: id string | null,             // The id of the turn that this alert will activate on. If null, activates at the top of the round
 *     endOfTurn: true,                      // Whether the alert should trigger at the end of the turn, or beginning of the turn. Only used if turnId is not null
 *     repeating: object,                    // If null, the alert will not repeat
 *     repeating.frequency: integer          // The number of rounds in a period before the alert triggers again
 *     repeating.expire: integer             // The round number on which this repeating alert expires. If expireAbsolute is *false*, this will be relative to the initial trigger round of the alert. If zero or null, will not expire.
 *     repeating.expireAbsolute: boolean     // Whether the expire round is absolute or not
 *     label: string                         // A short human-readable string that is displayed in the Combat Alerts window.
 *     message: string,                      // The message to be displayed in chat when the alert is activated
 *     recipientIds: [user id strings]       // The users to whom the message should be whispered. If empty, the message is public
 *     macro: string                         // The macro id or name to trigger when this alert is triggered
 *     args: [Object]                        // An array of arguments that will be available to the macro when it is executed
 *     userId: id string,                    // The user that created this alert
 * }
 */

export default class TurnAlert {

    id:string|null;
    name:string|null;
    combatId:string;
    createdRound:number;
    round:number;
    roundAbsolute:boolean;
    turnId:string|null;
    endOfTurn:boolean;
    repeating:TurnAlertRepeating|null;
    label:string|null;
    message:string|null;
    recipientIds:string[];
    macro:string|null;
    args:string[];
    userId:string;

    static get defaultData() {
        return {
            id: <string>getGame().combat?.id,
            name: null,
            combatId: <string>getGame().combat?.id,
            createdRound: <number>getGame().combat?.data.round,
            round: 0,
            roundAbsolute: false,
            turnId: null,
            endOfTurn: false,
            repeating: null,
            label: null,
            message: null,
            recipientIds: [],
            macro: null,
            args: [],
            userId: <string>getGame().userId,
        };
    }

    static get defaultRepeatingData() {
        return {
            frequency: 1,
            expire: Infinity,
            expireAbsolute: false,
        };
    }

    /** gets the Combat object that this alert belongs to. */
    static getCombat = (alert) => getGame().combats?.get(alert.combatId);

    /** gets the index of the turn that this alert is set to trigger on. */
    static getTurnIndex = (alert) => TurnAlert.getCombat(alert)?.turns.findIndex((t) => t.id === alert.turnId);

    /** gets the next upcoming round and turn that this alert will trigger on. */
    static getNextTriggerTurn = (alert, currentRound, currentTurn) => ({
        round: TurnAlert.nextTriggerRound(alert, currentRound, currentTurn),
        turn: TurnAlert.getTurnIndex(alert),
    });

    /** gets the next round that this alert will trigger on. */
    static nextTriggerRound(alert, currentRound, currentTurn) {
        const initialRound = alert.roundAbsolute ? alert.round : alert.createdRound + alert.round;
        const alertTurn = <number>TurnAlert.getTurnIndex(alert);

        if (alert.repeating) {
            // current turn is before the initial trigger of the alert
            if (compareTurns(initialRound, alertTurn, currentRound, currentTurn) > 0) {
                return initialRound;
            } else {
                const roundDelta = currentRound - initialRound;
                const cyclesBeyondInitial = Math.ceil(roundDelta / alert.repeating.frequency);
                const round = cyclesBeyondInitial * alert.repeating.frequency + initialRound;
                return currentRound == round && alertTurn != -1 && alertTurn < currentTurn
                    ? round + alert.repeating.frequency
                    : round;
            }
        } else {
            return initialRound;
        }
    }

    /** checks whether a given alert triggers on the current round and turn */
    static checkTrigger(alert, currentRound, currentTurn, previousRound, previousTurn) {
        let triggerRound,
            triggerTurn = 0;

        if (alert.endOfTurn) {
            triggerRound = previousRound;
            triggerTurn = previousTurn;
        } else {
            triggerRound = currentRound;
            triggerTurn = currentTurn;
        }

        const { round, turn } = TurnAlert.getNextTriggerTurn(alert, triggerRound, triggerTurn);
        return compareTurns(round, turn, triggerRound, triggerTurn) === 0;
    }

    /** checks whether a given alert is expired given the current round and turn */
    static checkExpired(alert, currentRound, currentTurn, previousRound, previousTurn) {
        let triggerRound,
            triggerTurn = 0;

        if (alert.endOfTurn) {
            triggerRound = previousRound;
            triggerTurn = previousTurn;
        } else {
            triggerRound = currentRound;
            triggerTurn = currentTurn;
        }

        let round:number,
            turn:number = 0;
        if (alert.repeating) {
            const initialRound = alert.roundAbsolute ? alert.round : alert.createdRound + alert.round;
            round = alert.repeating.expireAbsolute
                ? alert.repeating.expire
                : initialRound + (alert.repeating.expire || Infinity);
            turn = <number>TurnAlert.getTurnIndex(alert);
        } else {
            const nextTrigger = TurnAlert.getNextTriggerTurn(alert, triggerRound, triggerTurn);
            round = nextTrigger.round;
            turn = <number>nextTrigger.turn;
        }
        return compareTurns(round, turn, triggerRound, triggerTurn) <= 0;
    }

    static async execute(alert) {
        if (alert.message) {
            const messageData = {
                speaker: {
                    alias: getGame().i18n.localize(`${TURN_ALERT_MODULE_NAME}.APP.TurnAlert`),
                },
                content: alert.message,
                whisper: alert.recipientIds,
            };
            await ChatMessage.create(messageData);
        }

        if (alert.macro) {
            const macro = getGame().macros?.get(alert.macro) || getGame().macros?.getName(alert.macro);
            if (macro) {
                this._customExecute(alert, macro);
            } else {
                throw new Error(`Tried to execute macro "${alert.macro}" but it did not exist.`);
            }
        }
    }

    static _customExecute(alert, macro) {
        // Chat macros
        if (macro.data.type === "chat") {
            //@ts-ignore
            ui.chat?.processMessage(macro.data.command).catch((err) => {
                ui.notifications?.error("There was an error in your chat message syntax.");
                error(err);
            });
        }

        // Script macros
        else if (macro.data.type === "script") {
            if (!getGame().user?.can("MACRO_SCRIPT")) {
                return ui.notifications?.warn(`You are not allowed to use JavaScript macros.`);
            }
            const turn = <Combatant>this.getCombat(alert)?.turns.find((t) => t.id === alert.turnId);
            const token = <Token>getCanvas().tokens?.get(<string>turn?.data.tokenId);
            const speaker = ChatMessage.getSpeaker({ token });
            const actor = getGame().actors?.get(<string>speaker.actor);
            const character = getGame().user?.character;
            const args = alert.args;
            try {
                eval(macro.data.command);
            } catch (err) {
                ui.notifications?.error(`There was an error in your macro syntax. See the console (F12) for details`);
                error(`Encountered an error while evaluating the macro for alert "${alert.id}:"`);
                error(err);
            }
        }
    }

    /** gets the alerts flag on the given combat. */
    static _getAlertObjectForCombat(combatId):TurnAlert|undefined  {
        combatId = combatId || getGame().combat?.data._id;
        const combat = getGame().combats?.get(combatId);
        if (!combat){
          throw new Error(`No combat exists with ID ${combatId}`);
        }
        return <TurnAlert>combat.getFlag(TURN_ALERT_MODULE_NAME,'alerts');//combat.data.flags.turnAlert?.alerts;
    }

    /**
     * Gets a specific alert on a specific combat. Returns undefined if the alert doesn't exist
     * If combatId is undefined or null, assumes the current combat.
     * @param {string} alertId The ID of the alert to get
     * @param {string} combatId The ID of the combat that the alert can be found on
     */
    static getAlertById(alertId, combatId):TurnAlert|undefined {
        const alerts = <TurnAlert>this._getAlertObjectForCombat(combatId);
        if (!alerts){
          return undefined;
        }
        else{
          return alerts[alertId];
        }
    }

    /**
     * Gets the first alert with a name that matches the given one.
     * If combatId is undefined or null, assumes the current combat.
     * @param {string} alertName The name property of the alert that you want to find
     * @param {string} combatId The ID of the combat that the alert can be found on
     */
    static getAlertByName(alertName, combatId):TurnAlert|undefined {
        return TurnAlert.find((alert) => alert.name === alertName, combatId);
    }

    /**
     * Returns an array of all alerts on a given combat.
     * If combatId is undefined or null, assumes the current combat.
     * @param {string} combatId The ID of the combat to get all alerts from
     */
    static getAlerts(combatId):TurnAlert[]|undefined {
        const alerts = this._getAlertObjectForCombat(combatId);
        if (!alerts){
          return undefined;
        }
        else{
          return <TurnAlert[]>Object.values(alerts);
        }
    }

    /**
     * Returns the first alert on the given combat that matches the predicate function
     * @param {function} predicate The predicate function to check all alerts against
     * @param {string} combatId The ID of the combat to search
     */
    static find(predicate, combatId):TurnAlert {
        return <TurnAlert>this.getAlerts(combatId)?.find(predicate);
    }

    /**
     * Creates a new turn alert with the given data.
     * This function creates the alert in the database by attaching the alert data
     * to the combat with the id provided as the combatId in the alert data.
     * @param {Object} data                             The alert data to add.
     * @param {id string} data.combatId                 The id of the combat that this turn alert belongs to
     * @param {integer} data.createdRound               The combat round during which this alert was created
     * @param {integer} data.round                      The round that this turn alert will activate on
     * @param {boolean} data.roundAbsolute              Whether the round number is absolute (i.e. the alert happens on round 5) or relative to the round during which the alert was created (i.e. the alert happens 5 rounds after creation)
     * @param {id string} data.turnId                   The id of the turn that this alert will activate on. If null, activates at the top of the round
     * @param {boolean} data.endOfTurn                  Whether the alert should trigger at the end of the turn, or beginning of the turn. Only used if turnId is not null.
     * @param {Object} data.repeating                   If null, the alert will not repeat
     * @param {integer} data.repeating.frequency        The number of rounds in a period before the alert triggers again
     * @param {integer} data.repeating.expire           The round number on which this repeating alert expires. If expireAbsolute is *false*, this will be relative to the initial trigger round of the alert.
     * @param {boolean} data.repeating.expireAbsolute   Whether the expire round is absolute or relative
     * @param {string} data.label                       A short human-readable string to identify the alert. Displayed in the Combat Alerts window
     * @param {string} data.message                     The message to be displayed in chat when the alert is activated
     * @param {Array(id string)} data.recipientIds      The users to whom the message should be whispered. If empty, the message is public
     * @param {string} data.macro                       The macro id or name to trigger when this alert is triggered
     * @param {Array} data.args                         An array of arguments that will be available and in scope when the macro executes
     * @param {id string} data.userId                   The user that created this alert
     */
    static async create(data) {
        const defaultData = TurnAlert.defaultData;
        const alertData = foundry.utils.mergeObject(defaultData, data);
        if (alertData.repeating) {
            alertData.repeating = foundry.utils.mergeObject(TurnAlert.defaultRepeatingData, alertData.repeating);
        }

        const combat = getGame().combats?.get(alertData.combatId);
        if (!combat) {
            throw new Error(`Invalid combat id provided, cannot add alert to combat: ${alertData.combatId}`);
        }

        if (alertData.turnId !== null && TurnAlert.getTurnIndex(alertData) === -1) {
            throw new Error(
                `The provided turnId ("${alertData.turnId}") does not match any combatants in combat "${alertData.combatId}"`
            );
        }

        if (combat.canUserModify(<User>getGame().user, "update")) {
            const id = randomID(16);
            alertData.id = id;

            let combatAlerts = <TurnAlert[]>combat.getFlag(TURN_ALERT_MODULE_NAME, "alerts");
            if (!combatAlerts){
               combatAlerts = [];
            }
            else{
              combatAlerts = foundry.utils.deepClone(combatAlerts);
            }
            combatAlerts[id] = alertData;

            return combat
                .update({ [`flags.${TURN_ALERT_MODULE_NAME}.alerts`]: combatAlerts })
                .then(() => log(`Turn Alert | Created Alert ${id} on combat ${alertData.combatId}`));
        } else {
            log(
                `Turn Alert | User ${getGame().userId} does not have permission to edit combat ${alertData.combatId}; sending createAlert request...`
            );
            getGame().socket?.emit(`module.${TURN_ALERT_MODULE_NAME}`, { type: "createAlert", alertData: data });
        }
    }

    /**
     * Updates a given turn alert. REQUIRES the given alert data to contain an ID and combat ID.
     * @param {object} data The TurnAlert data to update.
     */
    static async update(data:TurnAlert) {
        if (!data.id) {
            throw new Error("Cannot update an alert that doesn't contain an alert ID.");
        }
        if (!data.combatId) {
            throw new Error("Cannot update an alert that doesn't contain a combat ID.");
        }

        const combat = getGame().combats?.get(data.combatId);

        if (!combat) {
            throw new Error(`The combat "${data.combatId}" does not exist.`);
        }

        const alerts = <TurnAlert[]>combat.getFlag(TURN_ALERT_MODULE_NAME, "alerts");
        const existingData = getProperty(alerts[0], data.id);

        if (!existingData) {
            throw new Error(
                `Cannot update alert ${data.id} in combat ${data.combatId} because that alert doesn't already exist in that combat.`
            );
        }

        if (combat.canUserModify(<User>getGame().user, "update")) {
            if (data.repeating) {
              //@ts-ignore
              data.repeating = <TurnAlertRepeating>foundry.utils.mergeObject(this.prototype.constructor.defaultRepeatingData, data.repeating);
            }

            alerts[data.id] = foundry.utils.mergeObject(existingData, data);

            await combat.unsetFlag(TURN_ALERT_MODULE_NAME, "alerts");
            return combat
                .setFlag(TURN_ALERT_MODULE_NAME, "alerts", alerts)
                .then(() => log(` Updated Alert ${data.id} on combat ${data.combatId}`));
        } else {
            log(
                ` User ${getGame().userId} does not have permission to edit combat ${data.combatId}; sending updateAlert request...`
            );
            getGame().socket?.emit(TURN_ALERT_SOCKET_NAME, { type: "updateAlert", alertData: data });
        }
    }

    /**
     * Deletes an alert from a given combat.
     * @param {id string} combatId The id of the combat to delete an alert from.
     * @param {id string} alertId The id of the alert to delete.
     */
    static async delete(combatId, alertId) {
        const combat = getGame().combats?.get(combatId);

        if (!combat) {
            throw new Error(`The combat "${combatId}" does not exist.`);
        }

        if (combat.canUserModify(<User>getGame().user, "update")) {
            const alerts = <TurnAlert>combat.getFlag(TURN_ALERT_MODULE_NAME, "alerts") || {};

            if (!(alertId in alerts)) {
                throw new Error(`The alert "${alertId}" does not exist in combat "${combatId}".`);
            }

            delete alerts[alertId];

            await combat.unsetFlag(TURN_ALERT_MODULE_NAME, "alerts");
            return combat
                .setFlag(TURN_ALERT_MODULE_NAME, "alerts", alerts)
                .then(() => log(` Deleted Alert ${alertId} on combat ${combatId}`));
        } else {
            log(
                ` User ${getGame().userId} does not have permission to edit combat ${combatId}; sending updateAlert request...`
            );
            getGame().socket?.emit(TURN_ALERT_SOCKET_NAME, { type: "deleteAlert", combatId, alertId });
        }
    }
}
