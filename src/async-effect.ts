import { ofType, Actions, Effect } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { identity } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { AsyncEffectConfig, createEffect } from './create-effect';

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
export function AsyncEffect(
  typeOrConfig: string | (AsyncEffectConfig & { debounce?: number }),
  ...actionTypes: string[]
) {
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
      return typeof typeOrConfig === 'string'
        ? createEffect(this.actions$.pipe(ofType(typeOrConfig, ...actionTypes)), handler.bind(this))
        : createEffect(
            this.actions$.pipe(
              ofType(...actionTypes),
              typeOrConfig.debounce ? debounceTime(typeOrConfig.debounce) : identity
            ),
            handler.bind(this),
            typeOrConfig
          );
    };
    // Same as if we had applied the decorator to the method we just defined
    Effect()(target, effectKey);
    return descriptor;
  };
}
