import { ofType, Actions, Effect } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { identity } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { AsyncEffectConfig, asyncEffect } from 'redux-async-effect';

/**
 * Method decorator to handle NgRx effects with async
 * methods or generators, must be attached to an async
 * method/generator that takes the value emitted by the
 * observable that triggered the effect.
 * If the handler is an async method, it should return either
 * an action to dispatch, a tuple/array of actions to
 * dispatch in sequence, or undefined if the effect should
 * not dispatch anything.
 * If the handler is an async generator, it should yield
 * actions or tuple/arrays of actions that will be
 * dispatched (if it does not yield anything than no action
 * is dispatched).
 * Any errors thrown by the method get logged but do not
 * kill the NgRx effect, so it will fire again on the next
 * action that matches the types.
 * The optional configuration object has four (also optional)
 * configuration keys: passing switch as true will make the
 * effect use a switchMap instead of flatMap for processing the
 * promises it gets from the handler; passing a debounce time (in ms)
 * in the debounce field will make it debounce the input stream 
 * by that time before passing it to the handler; passing a logging
 * function in the logger field will make the effect call that function
 * with any errors instead of logging to the console; finally, passing
 * the a string in the stream field will use a field of that name
 * as the input stream instead of actions$, which is the default.
 * If no action types are passed no filtering is done in the input
 * stream, otherwise it is assumed to be a stream of actions which
 * will be filtered with the ofType operator.
 * @param typeOrConfig optional configuration object, or the first action type effect fires on
 * @param actionTypes types of actions this effect fires on
 */
export function AsyncEffect(
  typeOrConfig: string | (AsyncEffectConfig & { debounce?: number, stream?: string }),
  ...actionTypes: string[]
) {
  return <
    T extends { [member: string]: any },
    K extends Extract<keyof T, string>,
    A,
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
      const actions$ = (typeof typeOrConfig === 'string' || !typeOrConfig.stream) ?
        this.actions$ as Actions : this[typeOrConfig.stream] as Actions;
      return typeof typeOrConfig === 'string'
        ? asyncEffect(actions$.pipe(ofType(typeOrConfig, ...actionTypes)), handler.bind(this))
        : asyncEffect(
            actions$.pipe(
              actionTypes.length > 0 ? ofType(...actionTypes) : identity,
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
