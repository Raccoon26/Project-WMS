export type EntityId = string & { readonly __entityId: unique symbol };
export type UtcTimestamp = string & { readonly __utcTimestamp: unique symbol };
export type IntegerString = string & {
  readonly __integerString: unique symbol;
};
export function integerString(value: bigint): IntegerString {
  return value.toString() as IntegerString;
}
export function parseInteger(value: string): bigint {
  if (!/^-?(0|[1-9]\d*)$/.test(value) || value === "-0")
    throw new Error("INVALID_INTEGER");
  return BigInt(value);
}
// No executable inventory, payment or external-side-effect handler at DEV01.
export interface Drainable {
  stopAccepting(): void;
  drain(): Promise<void>;
}
