import { TURN_ALERT_MODULE_NAME } from './settings';
export const preloadTemplates = async function () {
  const templatePaths = [
    // Add paths to "module/XXX/templates"
    //`/modules/${MODULE_NAME}/templates/XXX.html`,
    `/modules/${TURN_ALERT_MODULE_NAME}/templates/combat-alerts.hbs`,
    `/modules/${TURN_ALERT_MODULE_NAME}/templates/turn-alert-config.hbs`,
  ];
  return loadTemplates(templatePaths);
};
