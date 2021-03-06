import { Action } from '@ngrx/store';
import { from, of, ReplaySubject, Observable } from 'rxjs';
import { first, toArray } from 'rxjs/operators';

import { AsyncEffect } from './async-effect.decorator';
import { tuple } from 'redux-async-effect';

const mockAction1 = { type: 'ACTION1' };
const mockAction2 = { type: 'ACTION2' };

const logger1 = jest.fn();
const logger2 = jest.fn();
const logger3 = jest.fn();

class FakeEffects {
  constructor(
    public actions$: Observable<Action> = of(),
    public otherActions$: Observable<Action> = of(),
    public otherStream$: Observable<string> = of()
  ) {}

  @AsyncEffect(mockAction1.type)
  async handler1() {
    return mockAction2;
  }

  @AsyncEffect(mockAction1.type)
  async handler2() {
    return tuple({ type: 'ACTION2' }, { type: 'ACTION 2' });
  }

  @AsyncEffect(mockAction1.type, mockAction2.type)
  async handler3({ type }: Action) {
    const firstResponse = tuple<Array<{ type: string }>>();
    const secondResponse = tuple({ type: 'ACTION3' });
    return type === 'ACTION1' ? firstResponse : secondResponse;
  }

  @AsyncEffect(mockAction1.type, mockAction2.type)
  async handler4({ type }: Action) {
    const response = tuple({ type: 'ACTION3' });
    if (type === 'ACTION1') {
      throw 'error';
    } else {
      return response;
    }
  }

  @AsyncEffect({ logger: logger1 }, mockAction1.type, mockAction2.type)
  async handler5({ type }: Action) {
    const response = tuple({ type: 'ACTION3' });
    if (type === 'ACTION1') {
      throw 'error';
    } else {
      return response;
    }
  }

  @AsyncEffect({ switch: true, logger: logger1 }, mockAction1.type, mockAction2.type)
  async handler6({ type }: Action) {
    const response = tuple({ type: 'ACTION3' });
    if (type === 'ACTION1') {
      throw 'error';
    } else {
      return response;
    }
  }

  @AsyncEffect({ debounce: 100, logger: logger1 }, mockAction1.type, mockAction2.type)
  async handler7({ type }: Action) {
    const response = tuple({ type: 'ACTION3' });
    if (type === 'ACTION1') {
      throw 'error';
    } else {
      return response;
    }
  }

  @AsyncEffect(mockAction1.type)
  async *handler8(action: Action) {
    expect(action).toBe(mockAction1);
    yield { type: 'ACTION2' };
    yield { type: await Promise.resolve('ACTION 2') };
  }

  @AsyncEffect(mockAction1.type)
  async *handler9(action: Action) {
    expect(action).toBe(mockAction1);
    yield { type: 'ACTION2' };
    yield { type: 'ACTION 2' };
  }

  @AsyncEffect(mockAction1.type)
  handler10() {
    return tuple({ type: 'ACTION2' }, { type: 'ACTION 2' });
  }

  @AsyncEffect({ stream: 'otherActions$' })
  async handler11(action: Action) {
    return action;
  }

  @AsyncEffect({ stream: 'otherStream$' })
  async handler12(s: string) {
    return { type: s };
  }
}

describe('AsyncEffect', () => {
  it('passes action that matches type to handler and gets another action back', async () => {
    const mockEffects: any = new FakeEffects(of(mockAction1));
    const effect = mockEffects.handler1$();
    const response = await effect.toPromise();
    expect(response).toEqual(mockAction2);
  });

  it('passes action that matches type to handler and gets tuple of actions back', async () => {
    const mockEffects: any = new FakeEffects(of(mockAction1));
    const mockResponse = tuple({ type: 'ACTION2' }, { type: 'ACTION 2' });
    const effect = mockEffects.handler2$();
    const response = await effect.pipe(toArray()).toPromise();
    expect(response).toEqual(mockResponse);
  });

  it('does not return empty tuple of actions', async () => {
    const mockActions = new ReplaySubject<{ type: string }>();
    const mockEffects: any = new FakeEffects(mockActions);
    const firstResponse = tuple<Array<{ type: string }>>();
    const secondResponse = tuple({ type: 'ACTION3' });
    const effect = mockEffects.handler3$();
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    mockActions.complete();
    const response = await effectPromise;
    expect(response).toEqual(secondResponse[0]);
  });

  it('logs error without unwinding effect', async () => {
    const response = tuple({ type: 'ACTION3' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockActions = new ReplaySubject<{ type: string }>();
    const mockEffects: any = new FakeEffects(mockActions);
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = mockEffects.handler4$();
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(console.error).toHaveBeenCalledWith('Effect error:', 'error');
    expect(actualResponse).toEqual(response[0]);
  });

  it('logs error with optional logger wihout unwinding effect', async () => {
    const response = tuple({ type: 'ACTION3' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockActions = new ReplaySubject<{ type: string }>();
    const mockEffects: any = new FakeEffects(mockActions);
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = mockEffects.handler5$();
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(logger1).toHaveBeenCalledWith('error');
    expect(actualResponse).toEqual(response[0]);
  });

  it('uses switchMap instead of flatMap if passes switch: true', async () => {
    const response = tuple({ type: 'ACTION3' });
    const mockActions = new ReplaySubject<{ type: string }>();
    const mockEffects: any = new FakeEffects(mockActions);
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = mockEffects.handler6$();
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(logger2).not.toHaveBeenCalled();
    expect(actualResponse).toEqual(response[0]);
  });

  it('debounces input stream if debounce period set', async () => {
    const response = tuple({ type: 'ACTION3' });
    const mockActions = new ReplaySubject<{ type: string }>();
    const mockEffects: any = new FakeEffects(mockActions);
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = mockEffects.handler7$();
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(logger3).not.toHaveBeenCalled();
    expect(actualResponse).toEqual(response[0]);
  });

  it('passes action that matches type to async generator handler and gets tuple of actions back', async () => {
    const mockResponse = [{ type: 'ACTION2' }, { type: 'ACTION2' }, { type: 'ACTION 2' }, { type: 'ACTION 2' }];
    const mockEffects: any = new FakeEffects(from([mockAction1, mockAction1]));
    const effect = mockEffects.handler8$();
    const response = await effect.pipe(toArray()).toPromise();
    expect(response).toEqual(mockResponse);
  });

  it('passes action that matches type to generator handler and gets tuple of actions back', async () => {
    const mockResponse = [{ type: 'ACTION2' }, { type: 'ACTION2' }, { type: 'ACTION 2' }, { type: 'ACTION 2' }];
    const mockEffects: any = new FakeEffects(from([mockAction1, mockAction1]));
    const effect = mockEffects.handler9$();
    const response = await effect.pipe(toArray()).toPromise();
    expect(response).toEqual(mockResponse);
  });

  it('passes action that matches type to handler and gets tuple of actions back synchronously', async () => {
    const mockResponse = tuple({ type: 'ACTION2' }, { type: 'ACTION 2' });
    const mockEffects: any = new FakeEffects(of(mockAction1));
    const effect = mockEffects.handler10$();
    const response = await effect.pipe(toArray()).toPromise();
    expect(response).toEqual(mockResponse);
  });

  it('passes action that matches type to handler and gets another action back', async () => {
    const mockEffects: any = new FakeEffects(undefined, of(mockAction1));
    const effect = mockEffects.handler11$();
    const response = await effect.toPromise();
    expect(response).toEqual(mockAction1);
  });

  it('passes observable from other stream to handler and and gets another action back', async () => {
    const mockEffects: any = new FakeEffects(undefined, undefined, of('ACTION1'));
    const effect = mockEffects.handler12$();
    const response = await effect.toPromise();
    expect(response).toEqual(mockAction1);
  });
});
