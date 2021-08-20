import { getCanvas, getGame, TURN_ALERT_MODULE_NAME } from '../settings';
import { i18n, i18nFormat } from '../../turn-alert';
import TurnAlert from '../TurnAlert';

/**
 * A window for creating or editing a turn alert.
 * The data object passed in to the should match the TurnAlert data schema.
 */
export default class TurnAlertConfig extends FormApplication {
  _roundAbsolute: boolean;
  _expireAbsolute: boolean;

  combat: Combat;
  turn: Combatant;

  constructor(data: TurnAlert, options) {
    data = <TurnAlert>foundry.utils.mergeObject(TurnAlert.defaultData, data);
    if (data.repeating) {
      data.repeating = foundry.utils.mergeObject(TurnAlert.defaultRepeatingData, data.repeating);
    }

    super(data, options);

    if (!getGame().combats?.has(data.combatId)) {
      ui.notifications?.error(i18n(`${TURN_ALERT_MODULE_NAME}.ERROR.CannotShowAlertConfig.NoCombatId`));

      const combats = Array.from(<IterableIterator<string>>getGame().combats?.keys()).join(', ');
      throw new Error(`Invalid combat id provided. Got ${data.combatId}, which does not match any of [${combats}]`);
    }

    this._roundAbsolute = data.roundAbsolute;
    this._expireAbsolute = <boolean>data.repeating?.expireAbsolute;
    this.combat = <Combat>getGame().combats?.get(data.combatId);
    //@ts-ignore
    this.turn = this.object.turnId ? this.combat.turns.find((turn) => turn.id === this.object.turnId) : null;
  }

  get _turnData() {
    return !this.turn
      ? null
      : {
          imgPath: this.turn.token?.data.img,
          name: this.turn.token?.name,
          initiative: this.turn.initiative,
        };
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'turn-alert-config',
      classes: ['sheet'],
      title: i18n(`${TURN_ALERT_MODULE_NAME}.APP.TurnAlertConfigTitle`),
      template: `/modules/${TURN_ALERT_MODULE_NAME}/templates/turn-alert-config.hbs`,
      width: 450,
      submitOnChange: false,
      closeOnSubmit: true,
      resizable: true,
    });
  }

  /** @override */
  getData(options): any {
    //@ts-ignore
    const { round, roundAbsolute, endOfTurn, turnId, repeating } = this.object;
    return {
      object: foundry.utils.deepClone(this.object),
      roundLabel: this._getRoundLabel(roundAbsolute),
      expireLabel: this._getExpireLabel(repeating?.expireAbsolute),
      validRound: this._validRound(round, roundAbsolute, endOfTurn),
      topOfRound: !turnId,
      turnData: this._turnData,
      repeating: Boolean(repeating),
      users: getGame().users?.map((user) => ({
        id: user.data._id,
        name: user.data.name,
        //@ts-ignore
        selected: this.object.recipientIds?.includes(user.data._id),
      })),
      userCount: getGame().users?.entries.length,
      options: this.options,
      //@ts-ignore
      submitButton: this.object.id
        ? i18n(`${TURN_ALERT_MODULE_NAME}.APP.UpdateAlert`)
        : i18n(`${TURN_ALERT_MODULE_NAME}.APP.CreateAlert`),
    };
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.unshift({
      icon: 'fas fa-info-circle',
      class: 'icon',
      label: '',
      onclick: async (event) => {
        window.open('https://github.com/schultzcole/FVTT-Turn-Alert/wiki/User-Guide#turn-alert-configuration-dialog');
      },
    });

    return buttons;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.turn-display').hover(this._onCombatantHover.bind(this), this._onCombatantHoverOut.bind(this));
  }

  _onCombatantHover(event) {
    event.preventDefault();
    const token = getCanvas().tokens?.get(<string>this.turn.token?.id);
    //@ts-ignore
    if (token && token.isVisible && !token._controlled) {
      //@ts-ignore
      token._onHoverIn(event);
    }
  }

  _onCombatantHoverOut(event) {
    event.preventDefault();
    const token = getCanvas().tokens?.get(<string>this.turn.token?.id);
    if (token) {
      //@ts-ignore
      token._onHoverOut(event);
    }
  }

  /** @override */
  _onChangeInput(event) {
    let fd = new FormData();
    if (isNewerVersion(getGame().data.version, '0.7.0')) {
      fd = new FormDataExtended(event.currentTarget.form, {});
    } else {
      //@ts-ignore
      fd = <FormDataExtended>this._getFormData(event.currentTarget.form);
    }

    let formRound = Number(fd.get('round'));
    const formRoundAbsolute = fd.get('roundAbsolute') === 'true';
    const formRepeating = fd.get('repeatingToggle') === 'true';
    const formEndOfTurn = fd.get('endOfTurn') === 'true';
    const formMacroString = fd.get('macro');

    // Convert between absolute and relative round number
    const prevRoundAbsolute = this._roundAbsolute || false;
    if (prevRoundAbsolute != formRoundAbsolute) {
      formRound = formRoundAbsolute
        ? this.combat.data.round + formRound // round number was previously relative
        : formRound - this.combat.data.round; // round number was previously absolute
    }

    //@ts-ignore
    this._roundAbsolute = formRoundAbsolute;

    // Get repeating parameters if necessary
    let formRepeatParams = {};
    if (formRepeating) {
      formRepeatParams = {
        frequency: Number(fd.get('repeatFrequency')),
        expire: Number(fd.get('repeatExpire')),
        expireAbsolute: fd.get('repeatExpireAbsolute') === 'true',
      };
    }

    // Update repeating expiration round based on absolute/relative and initial trigger round.
    const triggerRoundAbs = formRoundAbsolute ? formRound : this.combat.data.round + formRound;
    const prevExpireAbsolute = this._expireAbsolute || false;
    //@ts-ignore
    if (prevExpireAbsolute != formRepeatParams.expireAbsolute) {
      //@ts-ignore
      formRepeatParams.expire = formRepeatParams.expireAbsolute
        ? //@ts-ignore
          triggerRoundAbs + formRepeatParams.expire // expire round was previously relative
        : //@ts-ignore
          formRepeatParams.expire - triggerRoundAbs; // expire round was previously absolute
    }
    //@ts-ignore
    this._expireAbsolute = formRepeatParams.expireAbsolute;

    this._updateForm(formRound, formRoundAbsolute, formRepeating, formEndOfTurn, formMacroString, formRepeatParams);
  }

  _updateForm(round, roundAbsolute, repeating, endOfTurn, macroString, repeatParams) {
    const form = $('.turn-alert-config');

    const roundLabel = form.find('#roundLabel');
    roundLabel.text(this._getRoundLabel(roundAbsolute));

    const roundTextBox = form.find('#round');
    roundTextBox.prop('value', round);

    const validRoundWarning = form.find('#validRoundWarning');
    if (this._validRound(round, roundAbsolute, endOfTurn)) {
      validRoundWarning.hide();
    } else {
      validRoundWarning.show();
    }

    const repeatingParams = form.find('#repeatingParams');
    if (repeating) {
      repeatingParams.show();

      const frequencyTextBox = repeatingParams.find('#frequency');
      frequencyTextBox.prop('value', Math.max(repeatParams.frequency, 1));

      const expireLabel = repeatingParams.find('#expireLabel');
      expireLabel.text(this._getExpireLabel(repeatParams.expireAbsolute));

      const expireTextBox = repeatingParams.find('#expire');
      expireTextBox.prop('value', repeatParams.expire);
    } else {
      repeatingParams.hide();
    }

    const validMacroWarning = form.find('#macroWarning');
    if (this._validMacro(macroString)) {
      validMacroWarning.hide();
    } else {
      validMacroWarning.show();
    }
  }

  _getRoundLabel(roundAbsolute) {
    return roundAbsolute
      ? i18n(`${TURN_ALERT_MODULE_NAME}.APP.TriggerOnRound`)
      : i18n(`${TURN_ALERT_MODULE_NAME}.APP.TriggerAfterRounds`);
  }

  _getExpireLabel(expireAbsolute) {
    return expireAbsolute
      ? i18n(`${TURN_ALERT_MODULE_NAME}.APP.RepeatExpireOn`)
      : i18n(`${TURN_ALERT_MODULE_NAME}.APP.RepeatExpireAfter`);
  }

  _validRound(round, roundAbsolute, endOfTurn) {
    const thisRoundLater = this.combat.data.round < round;
    const isCurrentRound = this.combat.data.round == round;
    //@ts-ignore
    const thisTurnIndex = this.combat.turns.findIndex((turn) => turn.id === this.object.turnId);
    const thisTurnLater = this.combat.data.turn < thisTurnIndex;
    const isCurrentTurn = this.combat.data.turn == thisTurnIndex;
    const turnValid = thisTurnLater || (endOfTurn && isCurrentTurn);

    if (roundAbsolute) {
      return thisRoundLater || (isCurrentRound && turnValid);
    } else {
      return round > 0 || turnValid;
    }
  }

  _validMacro(macroString) {
    return Boolean(!macroString || getGame().macros?.get(macroString) || getGame().macros?.getName(macroString));
  }

  /** @override */
  async _updateObject(event, formData) {
    const whisperRecipients = $('.turn-alert-config #recipients option')
      .get()
      //@ts-ignore
      .map((option) => ({ selected: option.selected, id: option.value }));

    const newData = {
      round: formData.round,
      roundAbsolute: formData.roundAbsolute,
      repeating: formData.repeatingToggle
        ? {
            frequency: formData.repeatFrequency,
            expire: formData.repeatExpire,
            expireAbsolute: formData.repeatExpireAbsolute,
          }
        : null,

      //@ts-ignore
      endOfTurn: !this.object.topOfRound && formData.endOfTurn,
      label: formData.label,
      message: formData.message,
      recipientIds: whisperRecipients.every((r) => r.selected)
        ? []
        : whisperRecipients.filter((r) => r.selected).map((r) => r.id),
      macro: formData.macro,
    };

    const finalData = <TurnAlert>foundry.utils.mergeObject(this.object, newData, { inplace: false });
    //@ts-ignore
    if (this.object.id) {
      TurnAlert.update(finalData);
    } else {
      TurnAlert.create(finalData);
    }
  }
}
