import { from, of, Observable, Observer } from 'rxjs';
import { catchError, filter, flatMap, switchMap } from 'rxjs/operators';

export interface AsyncEffectConfig {
  readonly switch?: boolean;
  readonly logger?: (err: any) => any;
}

function isIterator<R>(value: any): value is AsyncIterableIterator<R> | Iterator<R> {
  return value.next !== undefined && value.return !== undefined && value.throw !== undefined;
}

/**
 * Creates an effect/epic that fires off a handler function,
 * an async handler function, or an async generator for each
 * value emitted by the input observable.
 * A handler function or async handler function should return
 * either an action to be dispatched, a tuple or array of actions
 * to be dispatched in sequence, or undefined to not dispatch any actions.
 * A generator or async generator handler should yield actions to be
 * dispatched, or tuples/arrays of actions to be dispatched in
 * sequence; if the generator does not yield anything no action
 * gets dispatched.
 * Errors thrown by the handler are logged but swallowed, so new
 * values emitted by the input observable will fire off the handler again.
 * The optional configuration object has two (also optional)
 * configuration keys: passing switch as true will make the
 * effect use a switchMap instead of flatMap for processing the
 * inner stream it builds from the handler, and passing a logging function
 * in the logger option will make the effect call that function with
 * any errors instead of logging to the console.
 * @param input input stream
 * @param handler handler function/generator
 * @param config optional configuration object
 */
export function asyncEffect<T, R>(
  input: Observable<T>,
  handler: (value: AsyncIterableIterator<T>) => AsyncIterableIterator<R> | IterableIterator<R>,
  config: AsyncEffectConfig & { raw: true }
): Observable<R extends (infer X)[] ? X : R>;
export function asyncEffect<T, R>(
  input: Observable<T>,
  handler: (value: T) => Promise<R> | Promise<void | R> | AsyncIterableIterator<R> | IterableIterator<R> | R | void,
  config?: AsyncEffectConfig
): Observable<R extends (infer X)[] ? X : R>;
export function asyncEffect<T, R>(
  input: Observable<T>,
  handler: any,
  config: any = {}
): Observable<R extends (infer X)[] ? X : R> {
  if (config.raw) {
    const inputGenerator = async function*() {
      const signalPromise: {
        promise?: Promise<void>;
        resolve?: () => void;
        reject?: (err: any) => void;
      } = {};
      signalPromise.promise = new Promise((resolve, reject) => {
        signalPromise.resolve = resolve;
        signalPromise.reject = reject;
      });
      let done = false;
      const buffer: T[] = [];
      const observer: Observer<T> = {
        next(v: T) {
          buffer.push(v);
          signalPromise.resolve!();
        },
        error(err: any) {
          signalPromise.reject!(err);
        },
        complete() {
          signalPromise.resolve!();
          done = true;
        }
      };
      const sub = input.subscribe(observer);
      try {
        while (!done) {
          await signalPromise.promise!;
          const elem = buffer.shift();
          if (elem !== undefined) {
            yield elem;
          }
        }
        while (buffer.length > 0) {
          const elem = buffer.shift();
          if (elem !== undefined) {
            yield elem;
          }
        }
      } finally {
        sub.unsubscribe();
      }
    };
    const handlerResult = handler(inputGenerator()) as AsyncIterator<R> | IterableIterator<R>;
    const output = new Observable<void | R>(subscriber => {
      let done = false;
      const loop = async () => {
        for await (const action of handlerResult) {
          if (done) {
            break;
          }
          subscriber.next(action);
        }
      };
      loop().then(() => subscriber.complete(), err => subscriber.error(err));
      return () => {
        done = true;
      };
    });
    return output.pipe(
      flatMap(actions => (Array.isArray(actions) ? actions : of(actions))),
      catchError(err => {
        if (config.logger) {
          config.logger(err);
        } else {
          console.error('Effect error:', err);
        }
        return of<void>();
      }),
      filter(x => x !== undefined)
    );
  } else {
    const innerStream = (value: T) => {
      const handlerResult = handler(value) as
        | Promise<R>
        | Promise<void | R>
        | AsyncIterableIterator<R>
        | IterableIterator<R>
        | R
        | void;
      let output: Observable<void | R>;
      if (handlerResult instanceof Promise) {
        output = from(handlerResult);
      } else if (isIterator(handlerResult)) {
        output = new Observable<void | R>(subscriber => {
          let done = false;
          const loop = async () => {
            for await (const action of handlerResult) {
              if (done) {
                break;
              }
              subscriber.next(action);
            }
          };
          loop().then(() => subscriber.complete(), err => subscriber.error(err));
          return () => {
            done = true;
          };
        });
      } else {
        output = of(handlerResult);
      }
      return output.pipe(
        flatMap(actions => (Array.isArray(actions) ? actions : of(actions))),
        catchError(err => {
          if (config.logger) {
            config.logger(err);
          } else {
            console.error('Effect error:', err);
          }
          return of<void>();
        }),
        filter(x => x !== undefined)
      );
    };
    return input.pipe(config.switch ? switchMap(innerStream) : flatMap(innerStream));
  }
}
