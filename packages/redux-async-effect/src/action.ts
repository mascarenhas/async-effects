export interface Action<T extends string = string> {
  readonly type: T;
}
