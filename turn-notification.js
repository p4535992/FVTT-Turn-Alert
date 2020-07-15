import TurnNotificationManager from "./scripts/TurnNotificationManager.js";
import CONST from "./scripts/const.js";
import TurnNotification from "./scripts/TurnNotification.js";

Hooks.on("init", () => {
    game.TurnNotificationManager = TurnNotificationManager;
});

Hooks.on("updateCombat", (combat, changed, diff, userId) => {
    if (!("round" in changed || "turn" in changed)) return;

    const notifications = combat.getFlag(CONST.moduleName, "notifications");

    const turn = combat.turns[combat.data.turn];
    const round = combat.data.round;
    let anyDeleted = false;
    for (let id in notifications) {
        const notification = notifications[id];
        if (game.userId !== notification.user) continue;
        if (TurnNotification.checkTrigger(notification, round, "round" in changed, turn)) {
            const messageData = {
                speaker: { alias: "Turn Notification" },
                content: notification.message
            };
            ChatMessage.create(messageData);

            if (!notification.repeating) {
                delete notifications[id];
                anyDeleted = true;
            }
        }
    }

    if (anyDeleted) combat.setFlag(CONST.moduleName, "notifications", notifications);
});
