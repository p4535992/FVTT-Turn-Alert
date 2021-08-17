/*
*     repeating: object,                    // If null, the alert will not repeat
*     repeating.frequency: integer          // The number of rounds in a period before the alert triggers again
*     repeating.expire: integer             // The round number on which this repeating alert expires. If expireAbsolute is *false*, this will be relative to the initial trigger round of the alert. If zero or null, will not expire.
*     repeating.expireAbsolute: boolean     // Whether the expire round is absolute or not
*/
export class TurnAlertRepeating {
}
