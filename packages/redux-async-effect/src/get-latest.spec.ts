import { Subject } from 'rxjs';

import { getLatest } from './get-latest';

describe('getLatest', () => {
  it('should get latest value from observable', async () => {
    const s = new Subject<string>();
    const p: Promise<string> = getLatest(s);
    s.next('foo');
    expect(await p).toEqual('foo');
  });

  it('should get latest value from multiple observables', async () => {
    const s: [Subject<string>, Subject<number>, Subject<boolean>] = [
      new Subject<string>(),
      new Subject<number>(),
      new Subject<boolean>()
    ];
    const p: Promise<[string, number, boolean]> = getLatest(...s);
    s[0].next('foo');
    s[1].next(2);
    s[2].next(true);
    expect(await p).toEqual(['foo', 2, true]);
  });
});
