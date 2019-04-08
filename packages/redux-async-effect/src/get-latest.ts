import { combineLatest, Observable } from 'rxjs';
import { first } from 'rxjs/operators';

type Cons<H, T extends any[]> = ((h: H, ...t: T) => void) extends ((...u: infer U) => void) ? U : never;

/**
 * Returns a promise for the latest value emitted by each observable
 * passed to it. Returns a promise for the value if passed just one
 * observable, or a promise to a tuple (array) of values if passed
 * more than one.
 * @param obs observables to get the values from
 */
export const getLatest: (<T>(o: Observable<T>) => Promise<T>) &
  (<F, T extends any[]>(o: Observable<F>, ...obs: { [K in keyof T]: Observable<T[K]> }) => Promise<Cons<F, T>>) = (
  o: any,
  ...obs: any[]
) => {
  if (!obs || obs.length === 0) {
    return o.pipe(first()).toPromise();
  } else {
    return combineLatest(o, ...obs)
      .pipe(first())
      .toPromise();
  }
};
