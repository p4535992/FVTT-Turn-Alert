import { handlePreUpdateCombat, handleUpdateCombat } from "./handleUpdateCombat.js";
import CombatAlertsApplication from "./apps/CombatAlertsApplication.js";
import TurnAlert from "./TurnAlert.js";
import TurnAlertConfig from "./apps/TurnAlertConfig.js";
import { getGame, TURN_ALERT_MODULE_NAME, TURN_ALERT_SOCKET_NAME } from "./settings.js";
import { i18n, warn } from "../turn-alert.js";
export let readyHooks = async () => {
    Hooks.on("preUpdateCombat", handlePreUpdateCombat);
    Hooks.on("updateCombat", handleUpdateCombat);
    Hooks.on("renderCombatTracker", (tracker, html, data) => {
        if (!data.combat?.data?.round)
            return;
        const alertButton = $(document.createElement("a"));
        alertButton.addClass(["combat-control", "combat-alerts"]);
        alertButton.attr("title", i18n(`${TURN_ALERT_MODULE_NAME}.APP.CombatAlertsTitle`));
        alertButton.html('<i class="fas fa-bell"></i>');
        alertButton.click((event) => {
            const combatId = data.combat.id;
            const app = new CombatAlertsApplication({ combatId });
            app.render(true);
        });
        html.find("header#combat-round h3").after(alertButton);
    });
};
export const setupHooks = async () => {
    // setup all the hooks
};
export const initHooks = () => {
    warn("Init Hooks processing");
    globalThis.TurnAlert = TurnAlert;
    globalThis.TurnAlertConfig = TurnAlertConfig;
    // patch_CombatTracker_activateListeners();
    // patch_CombatTracker_getEntryContextOptions();
    //@ts-ignore
    libWrapper.register(TURN_ALERT_MODULE_NAME, "CombatTracker.prototype.activateListeners", CombatTrackerPrototypeActivateListenersHandler, "MIXED");
    //@ts-ignore
    libWrapper.register(TURN_ALERT_MODULE_NAME, "CombatTracker.prototype._getEntryContextOptions", CombatTrackerPrototypeGetEntryContextOptionsHandler, "MIXED");
    getGame().socket?.on(TURN_ALERT_SOCKET_NAME, async (payload) => {
        const firstGm = getGame().users?.find((u) => u.isGM && u.active);
        switch (payload.type) {
            case "createAlert":
                if (!firstGm || getGame().user !== firstGm)
                    break;
                await TurnAlert.create(payload.alertData);
                break;
            case "updateAlert":
                if (!firstGm || getGame().user !== firstGm)
                    break;
                await TurnAlert.update(payload.alertData);
                break;
            case "deleteAlert":
                if (!firstGm || getGame().user !== firstGm)
                    break;
                await TurnAlert.delete(payload.combatId, payload.alertId);
                break;
            default:
                throw new Error(`Turn Alert | Unknown socket payload type: ${payload.type} | payload contents:\n${JSON.stringify(payload)}`);
                break;
        }
    });
};
/**
 * Patches CombatTracker#activateListeners to allow players to access
 * the context menu for combatants.
 */
export async function CombatTrackerPrototypeActivateListenersHandler(wrapped, ...args) {
    const [html] = args;
    // The existing activateListeners already adds the context menu
    // for GMs so we only need to add it for non-GMs here.
    if (!getGame().user?.isGM) {
        this._contextMenu(html);
    }
    return wrapped(args);
}
/**
 * Adds the "Add Alert" element to the combatant context menu.
 */
export async function CombatTrackerPrototypeGetEntryContextOptionsHandler(wrapped, ...args) {
    const entries = getGame().user?.isGM ? this : [];
    entries.unshift({
        name: i18n(`${TURN_ALERT_MODULE_NAME}.APP.AddAlert`),
        icon: '<i class="fas fa-bell"></i>',
        condition: (li) => {
            return getGame().combat?.combatants?.get(li.data("combatant-id"))?.isOwner;
        },
        callback: (li) => {
            const alertData = TurnAlert.defaultData;
            alertData.id = li.data("combatant-id");
            alertData.round = 1;
            alertData.turnId = li.data("combatant-id");
            new TurnAlertConfig(alertData, {}).render(true);
        },
    });
    return wrapped(args);
}
