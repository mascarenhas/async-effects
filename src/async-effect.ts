import { ofType, Actions, Effect } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { from, identity, of, Observable } from 'rxjs';
import { catchError, debounceTime, filter, flatMap, switchMap } from 'rxjs/operators';

export interface AsyncEffectConfig {
  readonly debounce?: number;
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
 * The optional configuration object has three (also optional)
 * configuration keys: passing switch as true will make the
 * effect use a switchMap instead of flatMap for processing the
 * promises it gets from the handler; passing a debounce time (in ms)
 * will make it debounce the action stream by that time before
 * passing it to the handler; finally, passing a logging function
 * will make the effect call that function with any errors instead
 * of logging to the console.
 * @param actions$ Actions object from NgRx
 * @param handler async handler function
 * @param typeOrConfig optional configuration object, or the first action type effect fires on
 * @param types action types to fire the handler on
 */
export function createEffect<T extends Action, R extends Action | Action[]>(
  actions$: Actions,
  handler: (action: T) => Promise<void | undefined | R> | AsyncIterator<R> | Iterator<R> | R,
  typeOrConfig: string | AsyncEffectConfig,
  ...types: string[]
) {
  const config = typeof typeOrConfig === 'string' ? {} : typeOrConfig;
  return actions$.pipe(
    typeof typeOrConfig === 'string' ? ofType<T>(typeOrConfig, ...types) : ofType<T>(...types),
    config.debounce ? debounceTime(config.debounce) : identity,
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

/**
 * Method decorator to handle NgRx affects with async
 * methods, must be attached to an async method that takes
 * the action that fired the effect and returns either
 * an action to dispatch, a tuple/array of actions to
 * dispatch in sequence, or undefined if the effect should
 * not dispatch anything.
 * The method should be part of an injectable service
 * that injects NgRx Actions in a public actions$ field
 * in its constructor.
 * Any errors thrown by the method get logged but do not
 * kill the NgRx effect, so it will fire again on the next
 * action that matches the types.
 * The optional configuration object has three (also optional)
 * configuration keys: passing switch as true will make the
 * effect use a switchMap instead of flatMap for processing the
 * promises it gets from the handler; passing a debounce time (in ms)
 * will make it debounce the action stream by that time before
 * passing it to the handler; finally, passing a logging function
 * will make the effect call that function with any errors instead
 * of logging to the console.
 * @param typeOrConfig optional configuration object, or the first action type effect fires on
 * @param actionTypes types of actions this effect fires on
 */
export function AsyncEffect(typeOrConfig: string | AsyncEffectConfig, ...actionTypes: string[]) {
  return <
    T extends { actions$: Actions; [member: string]: any },
    K extends Extract<keyof T, string>,
    A extends Action,
    R extends Action | Action[]
  >(
    target: T, // This is the prototype, not an instance
    propertyKey: K,
    descriptor: TypedPropertyDescriptor<
      T[K] & ((action: A) => Promise<void | undefined | R> | AsyncIterator<R> | Iterator<R> | R)
    >
  ) => {
    const handler = descriptor.value!;
    const effectKey = propertyKey + '$';
    // This must be a regular function instead of an arrow lambda
    // because we need this to be dynamically bound to the instance
    // holding the effects at runtime
    target[effectKey] = function() {
      return createEffect(this.actions$, handler.bind(this), typeOrConfig, ...actionTypes);
    };
    // Same as if we had applied the decorator to the method we just defined
    Effect()(target, effectKey);
    return descriptor;
  };
}
