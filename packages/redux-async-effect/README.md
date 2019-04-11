# Redux Async Effect

[Epics](https://redux-observable.js.org/docs/basics/Epics.html) from
[redux-observable](https://redux-observable.js.org) provide a flexible
model for handling side effects with Redux, but that flexibility
comes with the cost of dragging the complexities of composing and
dealing with observable streams (specially with regards to gracefully
error handling).

This library provides another way of defining epics, where an epic
still takes an input stream and produces and output stream of actions
to be dispatched, but the mapping from input values to output actions
can be done by a *handler*. This handler can be a simple synchronous
function, an `async` function, a synchronous generator, or an `async`
geneator, giving increasing levels of flexibility and power.

## Installation

Install with `npm`:

```bash
npm i redux-async-effect
```

Install with `yarn`:

```bash
yarn add redux-async-effect
```

## Dependencies

This library has peer dependencies on rxjs 6 and at least version
3.1 of the TypeScript compiler (because of its use of mapped types
over tuple types).

## Tutorial

A redux-observable epic is a function that takes a stream of actions
that have been dispatched and returns a stream of actions to dispatch.
To use this library to write an epic you still write the epic function,
but in its body, instead of taking the stream of actions and building
an operator pipeline to get the result you want, you instead
return the result of calling the library's `asyncEffect` function:

```typescript
const myEpic = (actions$: Observable<Action>) =>
  asyncEffect(actions$, async (action: Action) => {
    if (action.type === SomeAction.type) {
      try {
        const apiResult = await apiCall(action.payload);
        return new SomeActionSuccess(err);
      } catch (err) {
        return new SomeActionFailure(err);
      }
    }
  });
```

The first argument to `asyncEffect` is the input stream, which is
usually the action stream passed to the epic. The second argument is
a *handler*. Here, the handler is an `async` function, so we can `await`
on the result of an API call.

The handler gets called for each value emitted by the input stream,
and gets passed the value. Any actions the handler return get emitted
by the output stream (and will be dispatched to the store by redux-observable
if you have wired-up the epic to the store).

Notice how the handler can filter the input stream by simply not returning
anything if the action type does not match the type of actions it is interested
in.

### Switch

By default, the output stream is constructed by merging (with `mergeMap`) the
different values returned by the handlers, so no value returned by a handler
gets discarded. This behavior might not be desirable, though, so there is a
configuration option to build the output stream using `switchMap` instead:

```typescript
const myEpic = (actions$: Observable<Action>) =>
  asyncEffect(actions$, async (action: Action) => {
    if (action.type === SomeAction.type) {
      try {
        const apiResult = await apiCall(action.payload);
        return new SomeActionSuccess(err);
      } catch (err) {
        return new SomeActionFailure(err);
      }
    }
  }, { switch: true });
```

Suppose two actions with type `SomeAction.type` are emitted by the input stream,
but the handler for the first one only gets to emit a result after the handler for
the second one. In the epic without `{ switch: true }` both actions will be in the
output stream, while in the epic with `{ switch: true }` only the action emitted
by the second handler will be in the output stream.
