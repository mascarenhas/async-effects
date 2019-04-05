import { ofType } from '@ngrx/effects';
import { from, of, ReplaySubject, Subject } from 'rxjs';
import { first, toArray, debounceTime } from 'rxjs/operators';

import { asyncEffect } from './async-effect';
import { tuple } from './tuple';

describe('asyncEffect', () => {
  it('passes action that matches type to handler and gets another action back', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const handler = jest.fn(async () => mockAction2);
    const mockActions = of(mockAction1);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type)), handler);
    const response = await effect.toPromise();
    expect(handler).toHaveBeenCalledWith(mockAction1);
    expect(response).toEqual(mockAction2);
  });

  it('passes action that matches type to handler and gets tuple of actions back', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockResponse = tuple({ type: 'ACTION2' }, { type: 'ACTION 2' });
    const handler = jest.fn(async () => mockResponse);
    const mockActions = of(mockAction1);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type)), handler);
    const response = await effect.pipe(toArray()).toPromise();
    expect(handler).toHaveBeenCalledWith(mockAction1);
    expect(response).toEqual(mockResponse);
  });

  it('does not return empty tuple of actions', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const firstResponse = tuple<Array<{ type: string }>>();
    const secondResponse = tuple({ type: 'ACTION3' });
    const handler = jest.fn(async ({ type }) => (type === 'ACTION1' ? firstResponse : secondResponse));
    const mockActions = new ReplaySubject<{ type: string }>();
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type, mockAction2.type)), handler);
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    mockActions.complete();
    const response = await effectPromise;
    expect(response).toEqual(secondResponse[0]);
  });

  it('logs error without unwinding effect', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const response = tuple({ type: 'ACTION3' });
    const err = new Error('error');
    const handler = jest.fn(async ({ type }) => {
      if (type === 'ACTION1') {
        throw err;
      } else {
        return response;
      }
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockActions = new ReplaySubject<{ type: string }>();
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type, mockAction2.type)), handler);
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(console.error).toHaveBeenCalledWith('Effect error:', err);
    expect(actualResponse).toEqual(response[0]);
  });

  it('logs error with optional logger wihout unwinding effect', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const response = tuple({ type: 'ACTION3' });
    const err = new Error('error');
    const handler = jest.fn(async ({ type }) => {
      if (type === 'ACTION1') {
        throw err;
      } else {
        return response;
      }
    });
    const logger = jest.fn();
    const mockActions = new ReplaySubject<{ type: string }>();
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type, mockAction2.type)), handler, { logger });
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(logger).toHaveBeenCalledWith(err);
    expect(actualResponse).toEqual(response[0]);
  });

  it('logs error with optional logger unwinding effect with switch', done => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const response = tuple({ type: 'ACTION3' });
    const err = new Error('error');
    const handler = jest.fn(async ({ type }) => {
      if (type === 'ACTION1') {
        throw err;
      } else {
        return response;
      }
    });
    const mockActions = new Subject<{ type: string }>();
    const logger = jest.fn(() => mockActions.next(mockAction2));
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type, mockAction2.type)), handler, {
      switch: true,
      logger
    });
    effect.subscribe(actualResponse => {
      expect(logger).toHaveBeenCalledWith(err);
      expect(actualResponse).toEqual(response[0]);
      done();
    });
    mockActions.next(mockAction1);
  });

  it('uses switchMap instead of flatMap if passes switch: true', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const response = tuple({ type: 'ACTION3' });
    const err = new Error('error');
    const handler = jest.fn(async ({ type }) => {
      if (type === 'ACTION1') {
        throw err;
      } else {
        return response;
      }
    });
    const logger = jest.fn();
    const mockActions = new ReplaySubject<{ type: string }>();
    mockActions.next(mockAction1);
    mockActions.next(mockAction2);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type, mockAction2.type)), handler, {
      switch: true,
      logger
    });
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(logger).not.toHaveBeenCalled();
    expect(actualResponse).toEqual(response[0]);
  });

  it('debounces input stream if debounce period set', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockAction2 = { type: 'ACTION2' };
    const response = tuple({ type: 'ACTION3' });
    const err = new Error('error');
    const handler = jest.fn(async ({ type }) => {
      if (type === 'ACTION1') {
        throw err;
      } else {
        return response;
      }
    });
    const logger = jest.fn();
    const mockActions = new ReplaySubject<{ type: string }>();
    mockActions.next(mockAction1);
    const effect = asyncEffect(
      mockActions.pipe(
        ofType(mockAction1.type, mockAction2.type),
        debounceTime(100)
      ),
      handler,
      {
        logger
      }
    );
    const effectPromise = effect.pipe(first()).toPromise();
    mockActions.next(mockAction2);
    mockActions.complete();
    const actualResponse = await effectPromise;
    expect(logger).not.toHaveBeenCalled();
    expect(actualResponse).toEqual(response[0]);
  });

  it('passes action that matches type to async generator handler and gets tuple of actions back', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockResponse = [{ type: 'ACTION2' }, { type: 'ACTION2' }, { type: 'ACTION 2' }, { type: 'ACTION 2' }];
    const handler = async function*(action: any) {
      expect(action).toBe(mockAction1);
      yield { type: 'ACTION2' };
      yield { type: await Promise.resolve('ACTION 2') };
    };
    const mockActions = from([mockAction1, mockAction1]);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type)), handler);
    const response = await effect.pipe(toArray()).toPromise();
    expect(response).toEqual(mockResponse);
  });

  it('passes action that matches type to generator handler and gets tuple of actions back', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockResponse = [{ type: 'ACTION2' }, { type: 'ACTION2' }, { type: 'ACTION 2' }, { type: 'ACTION 2' }];
    const handler = function*(action: any) {
      expect(action).toBe(mockAction1);
      yield { type: 'ACTION2' };
      yield { type: 'ACTION 2' };
    };
    const mockActions = from([mockAction1, mockAction1]);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type)), handler);
    const response = await effect.pipe(toArray()).toPromise();
    expect(response).toEqual(mockResponse);
  });

  it('passes action that matches type to handler and gets tuple of actions back synchronously', async () => {
    const mockAction1 = { type: 'ACTION1' };
    const mockResponse = tuple({ type: 'ACTION2' }, { type: 'ACTION 2' });
    const handler = jest.fn(() => mockResponse);
    const mockActions = of(mockAction1);
    const effect = asyncEffect(mockActions.pipe(ofType(mockAction1.type)), handler);
    const response = await effect.pipe(toArray()).toPromise();
    expect(handler).toHaveBeenCalledWith(mockAction1);
    expect(response).toEqual(mockResponse);
  });
});
