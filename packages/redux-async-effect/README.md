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

The handler passed to `asyncEffect` is actually not restricted to emitting
Redux actions, it is fully generic (no type bounds) on the type of values
it emits. But in an epic we are constrained by the type of stream the eepic
returns, which must be a stream of Redux actions.

### Switch

By default, the output stream is constructed by merging (with `mergeMap`) the
different values returned by the handlers, so no value returned by a handler
gets discarded. This behavior might not be desirable, though, so there is a
configuration option to build the output stream using `switchMap` instead:

```typescript
import { ofType } from 'redux-observable';

const myEpic = (actions$: Observable<Action>) =>
  asyncEffect(actions$.pipe(ofType(SomeAction.type)),
    async (action: SomeAction) => {
      try {
        const apiResult = await apiCall(action.payload);
        return new SomeActionSuccess(err);
      } catch (err) {
        return new SomeActionFailure(err);
      }
    }, { switch: true });
```

Suppose two actions with type `SomeAction.type` are emitted by the input stream,
but the handler for the first one only gets to emit a result after the handler for
the second one. In the epic without `{ switch: true }` both actions will be in the
output stream, while in the epic with `{ switch: true }` only the action emitted
by the second handler will be in the output stream.

Notice that we are filtering the input stream *before* reaching the handler,
otherwise the values emitted by one call to the handler would actually get ignored
even if some other action came before the handler was finished, even if its type
was not `SomeAction.type`. If you really want an "imperative" epic you can do
a similar thing to `{ switch: true }` with a mutable variable:

```typescript
function valueIf<T>(val: T, pred: boolean) {
  return pred ? val : undefined;
}

const myEpic = (actions$: Observable<Action>) =>
  let latest: SomeAction | undefined;
  asyncEffect(actions$, async (action: Action) => {
    if (action.type === SomeAction.type) {
      latest = action;
      try {
        const apiResult = await apiCall(action.payload);
        return valueIf(new SomeActionSuccess(err), latest === action);
      } catch (err) {
        return valueIf(new SomeActionFailure(err), latest === action);
      }
    }
  });
```

### Debouncing

If you want to debounce the filtered input stream, you can pipe `debounceTime`
before passing the input stream to `asyncEffect`:

```typescript
const debounceMs = 100;

const myEpic = (actions$: Observable<Action>) =>
  asyncEffect(actions$.pipe(ofType(SomeAction.type), debounceTime(debounceMs)),
    async (action: SomeAction) => {
      try {
        const apiResult = await apiCall(action.payload);
        return new SomeActionSuccess(err);
      } catch (err) {
        return new SomeActionFailure(err);
      }
    }, { switch: true });
```

It is possible to do debouncing inside the handler, but filtering and debouncing
the input stream prior to reaching the handler leads to cleaner code.

### Error logging

The observable chain `asyncEffect` sets up swallows any errors thrown by the handler,
so the stream you are setting up does not run the risk of completing because of an
uncaught error. By default the errors are logged using `console.error`, but you can
pass another configuration parameter, `{ logger: <logging function> }` to do your
own error logging. The logging function takes an error (with type `any`) and should
not return anything.

The rationale for not propagating errors is that each value coming into the input
stream is like a request being made to a server; if a request fails for some reason
the whole server process does not get terminated.

If a handler (even an asynchronous generator one) wants to caught all errors itself
it is a simple as wrapping the body in a `try/catch` statement, and there is also
no chance of making a mistake with where in the observable pipeline you use the
`catchError` operator and end up completing your epic without meaning to.

### Async generator handlers

Async generators are part of the ES2018 standard, and are a way of combining
`async` functions with generators. Inside an async iterator you are free to
intersperse uses of `await` with `yield`. Under the hood what the generator
is actually producing is a sequence of promises for the values it is yielding.
But you do not have to worry about it to use them in your epics:

```typescript
const myEpic = (actions$: Observable<Action>) =>
  asyncEffect(actions$, async function*(action: Action) {
    if (action.type === GetMessages.type) {
      while (true) {
        const message = await getMessages(action.payload);
        if (message === undefined) break;
        yield new MessageReceived({ source: action.payload, message });
      }
    }
  });
```

The epic above will start, for every `GetMessages` action, an endless
loop which will poll an API for a new message from that source and yield
an action with that message when it is received. If the API returns
`undefined` it means the source is not going to send any new messages,
and we can break out of the loop.
