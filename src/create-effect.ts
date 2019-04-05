import { Action } from '@ngrx/store';
import { from, identity, of, Observable } from 'rxjs';
import { catchError, filter, flatMap, switchMap } from 'rxjs/operators';

export interface AsyncEffectConfig {
  readonly switch?: boolean;
  readonly logger?: (err: any) => any;
}

function isIterator<R>(value: any): value is AsyncIterator<R> | Iterator<R> {
  return value.next !== undefined && value.return !== undefined && value.throw !== undefined;
}

/**
 * Creates an NgRx effect that fires off an async handler function.
 * Errors thrown by the handler are logged but swallowed, so the
 * effect is not killed because of the error.
 * The optional configuration object has two (also optional)
 * configuration keys: passing switch as true will make the
 * effect use a switchMap instead of flatMap for processing the
 * promises it gets from the handler, and passing a logging function
 * will make the effect call that function with any errors instead
 * of logging to the console.
 * @param actions$ Actions object from NgRx, already filtered by ofType
 * @param handler async handler function
 * @param config optional configuration object
 */
export function createEffect<T, R extends Action | Action[]>(
  actions$: Observable<T>,
  handler: (action: T) => Promise<void | undefined | R> | AsyncIterator<R> | Iterator<R> | R,
  config: AsyncEffectConfig = {}
) {
  return actions$.pipe(
    (config.switch ? switchMap : flatMap)(action => {
      const handlerResult = handler(action);
      let stream: Observable<void | R>;
      if (handlerResult instanceof Promise) {
        stream = from(handlerResult);
      } else if (isIterator(handlerResult)) {
        stream = new Observable<R>(subscriber => {
          let live = true;
          const loop = async () => {
            while (live) {
              const { value, done } = await handlerResult.next();
              if (done) {
                break;
              } else {
                subscriber.next(value);
              }
            }
          };
          loop().then(() => subscriber.complete(), err => subscriber.error(err));
          return () => {
            live = false;
          };
        });
      } else {
        stream = of(handlerResult);
      }
      return stream.pipe(
        flatMap(actions => (Array.isArray(actions) ? actions : of(actions))),
        catchError(err => {
          if (config.logger) {
            config.logger(err);
          } else {
            console.error('Effect error:', err);
          }
          return of<undefined>();
        })
      );
    }),
    filter(identity)
  );
}
